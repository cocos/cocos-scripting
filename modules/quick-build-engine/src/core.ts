
import fs from 'fs-extra';
import ps from 'path';
import { ModuleResolver, replaceWithOutputExtension } from '@ccbuild/transform-utilities';
import { moduleSpecifierURLRelative } from '@ccbuild/transform-utilities';
import { pathToFileURL } from 'url';
import * as jss from 'javascript-stringify';
import type { FileUid } from './file-uid';
import { decodeVirtualFileUid, isVirtualFileUid, encodeVirtualFileUid, decodeRegularFilePath } from './file-uid';
import { VirtualModules } from './virtual-modules';
import { FileRecord } from './file-record';
import { SourceMapOptions } from './source-map-options';
import { bundleExternals } from './bundle-externals';
import { IBundler, TransformTargetModule } from './bundler';
import { TargetRecord } from './target';
import { FsCache } from './fs-cache';
import { ProgressMessage, Stage, TransformStageMessage } from './progress';
import { sequenceDiscarding } from './seq';
import winston from 'winston';
import RelateURl from 'relateurl';
import { StatsQuery } from '@ccbuild/stats-query';
import * as Modularize from '@ccbuild/modularize';
import { TransformResult } from './transformer/transformer';
import { BabelTransformer } from './transformer/babel-transformer';
import type { ImportMap } from './import-map';

type FileId = FileUid;

export type Platform = 'HTML5' | 'NATIVE';

const externalProtocol = 'external:';

export interface TargetOptions extends SourceMapOptions {
    /**
     * 加到功能模块的前缀。
     */
    featureUnitPrefix?: string;

    /**
     * 是否包含引擎 `editor/exports` 下的模块。
     */
    includeEditorExports?: boolean;

    /**
     * `'cc'` 模块的内容。
     */
    includeIndex?: {
        features: string[];
    };

    /**
     * 输出目录。
     */
    dir: string;

    /**
     * 输出格式。
     */
    format: 'commonjs' | 'systemjs';

    /**
     * 宽松模式.
     */
    loose?: boolean;

    loader?: boolean;

    /**
     * BrowsersList targets.
     */
    targets?: string | string[] | Record<string, string>;
    perf?: boolean;
}

export interface OutputProfile {
    importMap: ImportMap & { imports: NonNullable<ImportMap['imports']> };
    importMapFile: string;
    chunkDir: string;
}

export async function core({
    rootDir,
    statsQuery,
    entries,
    targetOptions,
    targetRecord,
    bundler,
    chunkDir,
    fsCache,
    vm,
    logger,
    onProgress,
    platform = 'HTML5',
}: {
    rootDir: string;
    statsQuery: StatsQuery;
    entries: FileUid[];
    targetOptions: TargetOptions;
    targetRecord: TargetRecord;
    bundler: IBundler;
    chunkDir: string;
    fsCache: FsCache;
    vm?: VirtualModules;
    logger: winston.Logger,
    onProgress?: (message: Readonly<ProgressMessage>) => void;
    platform: Platform,
}) {
    const babelHelpersModuleName = 'quick-compiler.babel-helpers';
    const babelHelpersModuleUid = encodeVirtualFileUid(babelHelpersModuleName);
    const moduleQuery = new Modularize.ModuleQuery({
        engine: rootDir,
        platform: 'WEB_EDITOR',
    });
    const moduleExportMap = await moduleQuery.getExportMap();

    const virtualModules = vm ?? new VirtualModules();
    await setupVirtualModules(platform);

    const moduleResolver = new ModuleResolver({
        rootDir,
    });

    // Do audition.
    const audition: {
        audited: Set<string>;
    } = { audited: new Set() };

    const transformProgress: TransformStageMessage = {
        stage: Stage.transform,
        total: 0,
        progress: 0,
        file: '',
    };

    const updateTransformProgress = onProgress
        ? () => onProgress(transformProgress)
        : undefined;

    await main();

    async function main() {
        await Promise.all(entries.concat(
            [babelHelpersModuleUid],
        ).map(
            (fileUid) => audit(fileUid),
        ));

        if (await rebuildExternalDependenciesIsNeeded()) {
            onProgress?.({
                stage: Stage.external,
            });
            await createExternalDependenciesStuffs();
        }
    }

    async function setupVirtualModules(platform: Platform) {
        const dynamicConstants = statsQuery.constantManager.exportDynamicConstants({
            // platform and mode are dynamic values, indeed we don't have to pass these value.
            platform,
            mode: 'PREVIEW',
            flags: {
                DEBUG: true,
                CULL_MESHOPT: false, // NOTE: CULL_MESHOPT should be disabled in 'editor' and 'preview' engine, it should only impact 'Build' result.
            },
        });
        virtualModules.set(
            'internal:constants',
            () => dynamicConstants,
        );

        virtualModules.set(
            babelHelpersModuleName,
            () => {
                return BabelTransformer.buildHelper();
            },
        );

    }

    /**
     * @param fileUid
     */
    async function audit(fileUid: FileId) {
        if (audition.audited.has(fileUid)) {
            return;
        }
        audition.audited.add(fileUid);

        if (fileUid in targetRecord.files) {
            return;
        }

        let source: string;
        let fileTime = 0;
        const isVirtual = isVirtualFileUid(fileUid);
        if (isVirtual) {
            const name = decodeVirtualFileUid(fileUid);
            if (!virtualModules.has(name)) {
                logger.error(`Can not find module(virtual): ${name}`);
                return;
            }
            source = virtualModules.get(name);
        } else {
            fileTime = (await fsCache.stat(fileUid)).mtimeMs;
            source = await fsCache.readFile(fileUid);
            if (fileUid.toLowerCase().endsWith('.json')) {
                // Because AMD (which is our engine code format, in editor or previewer)
                // is not able to import a json module, in [SystemJS](https://github.com/systemjs/systemjs/issues/2045).
                // We should transform the json module here.
                source = `export default ${jss.stringify(JSON.parse(source), undefined, 2)}`;
            }
        }

        // Update total
        ++transformProgress.total;
        transformProgress.file = fileUid;
        updateTransformProgress?.();
        transformProgress.file = '';
        logger.debug(`[QuickCompiler] Transforming ${fileUid}...`);

        const newFileRecord: FileRecord = {
            fileTime,
            dependencies: {},
            status: false,
        };
        targetRecord.files[fileUid] = newFileRecord;

        const transformResult = await (async () => {
            try {
                return await compileFile(source, fileUid, newFileRecord, bundler);
            } catch (err) {
                logger.error(err);
                return;
            }
        })();
        newFileRecord.status = !!transformResult;

        // Update progress
        ++transformProgress.progress;
        updateTransformProgress?.();

        const store = !transformResult ? undefined :
            bundler.store(fileUid, transformResult.code, transformResult.map);

        await store;
        await sequenceDiscarding(
            Object.entries(newFileRecord.dependencies).reduce((result, [_moduleSpecifier, resolveRecord]) => {
                if (!resolveRecord.external && resolveRecord.resolved) {
                    result.push(resolveRecord.resolved);
                }
                return result;
            }, [] as string[]),
            async (dependency) => await audit(dependency),
        );
    }

    /**
     * @param source
     * @param fileUid
     * @param record
     */
    async function compileFile(source: string, fileUid: string, record: FileRecord, bundler: IBundler): Promise<TransformResult> {
        const targetModule = bundler.targetMode ?? TransformTargetModule.esm;
        const targets = targetOptions.targets;
        const loose = targetOptions.loose ?? false;
        const optimizeDecorators = statsQuery.getOptimizeDecorators();
        const transformer = new BabelTransformer({
            targets,
            loose,
            targetModule,
            logger,
            optimizeDecorators,
        });

        const outFileURL = bundler.getOutFileUrl(fileUid);
        const resolveRelativeFromOutFile = new RelateURl(outFileURL);

        let fileName: string | undefined;
        let sourceFileName: string | undefined;
        let isFile = false;
        if (isVirtualFileUid(fileUid)) {
            sourceFileName = `virtual:///${decodeVirtualFileUid(fileUid)}`;
        } else {
            fileName = ps.resolve(rootDir, decodeRegularFilePath(fileUid));
            isFile = true;
            const fileURL = pathToFileURL(fileName);
            if (targetOptions.usedInElectron509) {
                sourceFileName = fileURL.href;
            } else {
                sourceFileName = resolveRelativeFromOutFile.relate(fileURL.href);
            }
        }

        const moduleId = bundler.getModuleId?.(fileUid) ?? fileUid;

        const getModuleRequestTo = (targetFileUid: string) => moduleSpecifierURLRelative(
            outFileURL,
            bundler.getOutFileUrl(targetFileUid),
        );

        const readDepRecord = (moduleSpecifier: string): string | undefined => {
            if (!(moduleSpecifier in record.dependencies)) {
                return undefined;
            }
            const resolveRecord = record.dependencies[moduleSpecifier];
            if (resolveRecord.resolved && !resolveRecord.external) {
                const replacement = replaceWithOutputExtension(getModuleRequestTo(resolveRecord.resolved));
                return replacement;
            } else {
                return undefined;
            }
        };

        const replaceModuleSpecifier = (moduleSpecifier: string): string | undefined => {
            if (moduleSpecifier in record.dependencies) {
                return readDepRecord(moduleSpecifier);
            }

            let resolvedModule: {
                file: string;
                isExternal: boolean;
            } | null;
            if (virtualModules.has(moduleSpecifier)) {
                resolvedModule = {
                    file: moduleSpecifier,
                    isExternal: false,
                };
            }
            else if (moduleSpecifier.startsWith(externalProtocol)) {
                if (moduleSpecifier.endsWith('.wasm') || moduleSpecifier.endsWith('.js.mem') || moduleSpecifier.endsWith('.wasm.fallback')) {
                    // for module ending with '.wasm' or '.js.mem', we only export an external url.
                    virtualModules.set(
                        moduleSpecifier,
                        () => {
                            return `export default '${moduleSpecifier}';`;
                        },
                    );
                    resolvedModule = {
                        file: moduleSpecifier,
                        isExternal: false,
                    };
                } else {
                    const externalInEngine = moduleSpecifier.replace(externalProtocol, 'native/external/');
                    resolvedModule = {
                        file: ps.join(rootDir, externalInEngine),
                        isExternal: true,
                    };
                }
            }
            else if (!fileName) { // isVirtualFileUid(fileUid)
                resolvedModule = {
                    file: moduleSpecifier,
                    isExternal: false,
                };
            }
            else if (moduleExportMap[moduleSpecifier]) {
                resolvedModule = {
                    file: moduleExportMap[moduleSpecifier],
                    isExternal: false,
                };
            }
            else {
                resolvedModule = moduleResolver.resolveSync(moduleSpecifier, fileName);
                if (resolvedModule && !resolvedModule.isExternal) {
                    const lower = resolvedModule.file.toLowerCase();
                    if (lower.endsWith('.d.ts')) {
                        // If a module is resolved to a declaration file.
                        // We are trying to figure out the real code file.
                        const baseName = resolvedModule.file.substr(0, resolvedModule.file.length - 5);
                        let found = false;
                        for (const extension of ['.js', '.json']) {
                            const name = `${baseName}${extension}`;
                            if (fs.pathExistsSync(name)) {
                                resolvedModule.file = name;
                                found = true;
                                break;
                            }
                        }
                        if (!found) {
                            resolvedModule = null;
                        }
                    }
                }
            }

            const resolveRecord: FileRecord['dependencies'][''] = record.dependencies[moduleSpecifier] = { resolved: undefined };
            if (!resolvedModule) {
                logger.debug(`Failed to resolve ${moduleSpecifier} from ${fileName}`);
            } else if (resolvedModule.isExternal) {
                resolveRecord.resolved = getDependencyFileId(resolvedModule.file);
                resolveRecord.external = true;
            } else {
                const depFileId = getFileUidFromResolved(resolvedModule.file);
                if (!depFileId) {
                    logger.error(`File ${resolvedModule.file} referenced from ${fileName ?? fileUid} is not under source root.`);
                } else {
                    resolveRecord.resolved = depFileId;
                }
            }

            return readDepRecord(moduleSpecifier);
        };

        return await transformer.transform(source, {
            fileName,
            sourceFileName,
            isFile,
            moduleId,
            replaceModuleSpecifier,
            isBabelHelper: fileUid === babelHelpersModuleUid,
        });
    }

    /**
     *
     */
    function countExternalDependencies() {
        const dependenciesMap: Record<string, string> = {};
        for (const fileRecord of Object.values(targetRecord.files)) {
            Object.assign(dependenciesMap, Object.entries(fileRecord.dependencies).reduce((result, [moduleSpecifier, resolveRecord]) => {
                if (resolveRecord.external && resolveRecord.resolved) {
                    result[moduleSpecifier] = resolveRecord.resolved;
                }
                return result;
            }, {} as Record<string, string>));
        }
        return dependenciesMap;
    }

    /**
     *
     */
    async function rebuildExternalDependenciesIsNeeded() {
        /// / TODO!!!!! remove
        // return true;

        // eslint-disable-next-line no-constant-condition
        if (true) {
            const old = targetRecord.externalDependencies;
            const now = countExternalDependencies();
            const keysOld = Object.keys(old);
            const keysNew = Object.keys(now);
            if (keysOld.length !== keysNew.length ||
                !keysOld.every((keyOld) => keysNew.includes(keyOld) && old[keyOld] === now[keyOld]) ||
                !keysNew.every((keyNew) => keysOld.includes(keyNew))
            ) {
                logger.debug(`Dependencies changed from ${JSON.stringify(old, undefined, 2)} to ${JSON.stringify(now, undefined, 2)}`);
                return true;
            }
        }

        // 任何外部依赖文件更新了，都需要重新构建。
        for (const file of Object.keys(targetRecord.externalDependencyWatchFiles)) {
            const stamp = targetRecord.externalDependencyWatchFiles[file];
            try {
                const stat = await fs.stat(getDependencyFile(file));
                if (stat.mtimeMs !== stamp) {
                    logger.debug(`[QuickCompiler] External dependency "${file}" changed.`);
                    return true;
                }
            } catch {
                logger.debug(`[QuickCompiler] Miss external dependency "${file}".`);
                return true;
            }
        }

        return false;
    }

    /**
     * @param chunkDir
     * @param importMapFile
     */
    async function createExternalDependenciesStuffs() {
        targetRecord.externalDependencyWatchFiles = {};
        targetRecord.externalDependencyImportMap = {};

        const dependenciesMap = countExternalDependencies();

        const dependenciesMapResolved: typeof dependenciesMap = {};
        for (const key of Object.keys(dependenciesMap)) {
            dependenciesMapResolved[key] = getDependencyFile(dependenciesMap[key]);
        }

        const dependencyEntries = Object.entries(dependenciesMapResolved).map(([k, v]): [string, string] => [v, k]);
        logger.debug(`Bundling external dependencies: ${JSON.stringify(dependenciesMapResolved, undefined, 2)}`);

        const bundleResult = await bundleExternals(dependencyEntries, {
            rootDir,
            perf: targetOptions.perf,
        });

        if (await fs.pathExists(chunkDir)) {
            await fs.emptyDir(chunkDir);
        }

        await bundleResult.write({
            format: targetOptions.format,
            sourceMap: true,
            chunkDir,
        });

        for (const moduleSpecifier of Object.keys(dependenciesMapResolved)) {
            const entry = dependenciesMapResolved[moduleSpecifier];
            const chunkRelativeURL = bundleResult.entryMap[entry].split(/[\\/]/g).map((part) => encodeURIComponent(part)).join('/');
            targetRecord.externalDependencyImportMap[moduleSpecifier] = chunkRelativeURL;
        }

        const watchFiles: Record<string, number> = {};
        for (const watchFile of bundleResult.watchFiles) {
            try {
                const stat = await fs.stat(watchFile);
                watchFiles[getDependencyFileId(watchFile)] = stat.mtimeMs;
            } catch {

            }
        }

        targetRecord.externalDependencies = dependenciesMap;
        targetRecord.externalDependencyWatchFiles = watchFiles;
    }

    /**
     * @param moduleNameOrFile
     */
    function getFileUidFromResolved(moduleNameOrFile: string) {
        if (virtualModules.has(moduleNameOrFile)) {
            return encodeVirtualFileUid(moduleNameOrFile);
        }
        const relativeFromRoot = ps.relative(ps.join(rootDir), moduleNameOrFile);
        if (relativeFromRoot.length === 0 ||
            relativeFromRoot.startsWith('..') ||
            ps.isAbsolute(relativeFromRoot)) {
            return null;
        } else {
            return relativeFromRoot;
        }
    }

    /**
     * @param dependencyFile
     */
    function getDependencyFileId(dependencyFile: string) {
        return ps.relative(rootDir, dependencyFile);
    }

    /**
     * @param dependencyFileId
     */
    function getDependencyFile(dependencyFileId: string) {
        return ps.resolve(rootDir, dependencyFileId);
    }
}
