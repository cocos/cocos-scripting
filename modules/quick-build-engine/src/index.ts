
import fs from 'fs-extra';
import ps from 'path';
import { IBundler } from './bundler';
import { ConcatBundler } from './concat-bundler';
import type { TargetOptions, Platform } from './core';
import { detectChangedFiles } from './target';
import type { TargetRecord } from './target';
import { urlRelative, pathToFileURL } from '@ccbuild/transform-utilities';
import { FsCache } from './fs-cache';
import { ProgressMessage, Stage } from './progress';
import { parallelDiscarding, sequenceDiscarding } from './seq';
import winston from 'winston';
import { StatsQuery } from '@ccbuild/stats-query';
import { encodeFilePath, encodeVirtualFileUid } from './file-uid';
import { VirtualModules } from './virtual-modules';
import globby from 'globby';
import Transport from 'winston-transport';
import type { ImportMap } from './import-map';

const VERSION = '1.2.32';

export interface QuickCompileOptions {
    rootDir: string;
    outDir: string;
    incrementalFile?: string;

    /**
     * 目标之间以什么样的方式运行编译：
     * - `par` 平行
     * - `seq` 顺序
     */
    targetLaunchPolicy?: 'par' | 'seq';

    targets: TargetOptions[];

    /**
     * 编译平台，有效值 'HTML5' 和 'NATIVE', 默认值是 'HTML5'。
     */
    platform?: Platform;

    /**
     * 日志文件。如未指定则直接输出到屏幕。
     */
    logFile?: string;

    onProgress?: (target: number, message: Readonly<ProgressMessage>) => void;
}

/**
 * @param options
 */
async function quickCompile(options: QuickCompileOptions, bundlers: IBundler[], statsQuery: StatsQuery): Promise<void> {
    const { rootDir, outDir, platform = 'HTML5' } = options;

    const loggerOptions: winston.LoggerOptions = {
        level: 'debug',
        format: winston.format.simple(),
    };
    if (options.logFile) {
        loggerOptions.transports = [
            new winston.transports.File({ level: 'debug', filename: options.logFile }),
            new EditorTransport({ level: 'warn' }),
        ];
    } else {
        loggerOptions.transports = [
            new EditorTransport(),
        ];
    }
    const logger = winston.createLogger(loggerOptions);

    logger.debug(`QuickCompiler v${VERSION}`);
    logger.debug(new Date().toUTCString());
    logger.debug(`Input options: ${JSON.stringify(options, undefined, 2)}`);

    const optionsRecord = recordOptions(options);

    const incrementalRecordFile = options.incrementalFile || ps.join(outDir, '.incremental.json');
    // Try to read incremental cache.
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const rootRecord: IncrementalRecord = await (async () => {
        try {
            const rootRecord = (await fs.readJSON(incrementalRecordFile)) as IncrementalRecord;
            if (rootRecord.version !== VERSION) {
                logger.debug(`[Quick-compiler] Version mismatch.`);
            } else {
                if (matchOptionsRecord(optionsRecord, rootRecord.options)) {
                    logger.debug(`[Quick-compiler] Incremental file seems great.`);
                    return rootRecord;
                } else {
                    logger.debug(
                        `[Quick-compiler] Options doesn't match.\n` +
                        `Last: ${JSON.stringify(rootRecord.options, undefined, 2)}\n` +
                        `Current: ${JSON.stringify(optionsRecord, undefined, 2)}`
                    );
                }
            }
        } catch {
            logger.debug(`[Quick-compiler] Version information lost.`);
        }

        logger.debug(`Clearing the outDir ${options.outDir}...`);
        await fs.emptyDir(options.outDir);
        return {
            version: VERSION,
            options: optionsRecord,
            targets: new Array(options.targets.length).fill(null).map((): TargetRecord => {
                return {
                    files: {},
                    externalDependencies: {},
                    externalDependencyImportMap: {},
                    externalDependencyWatchFiles: {},
                };
            }),
        };
    })();

    const fsCache = new FsCache(rootDir);

    const targetLauncher = (options.targetLaunchPolicy ?? 'seq') === 'seq'
        ? sequenceDiscarding
        : parallelDiscarding;

    await main();

    async function main(): Promise<void> {
        await targetLauncher(
            options.targets,
            async (targetOption, targetIndex) => {
                logger.debug(`Starting target ${targetIndex}`);
                const label = `QuickCompiler:Compile target ${targetIndex}`;
                console.time(label);
                await targetMain(
                    targetOption,
                    rootRecord.targets[targetIndex],
                    bundlers[targetIndex],
                    targetIndex,
                );
                console.timeEnd(label);
            },
        );


        // Write incremental cache.
        await fs.ensureDir(ps.dirname(incrementalRecordFile));
        await fs.writeFile(incrementalRecordFile, JSON.stringify(rootRecord, undefined, 4));
    }

    async function targetMain(targetOptions: TargetOptions, targetRecord: TargetRecord, bundler: IBundler, targetIndex: number): Promise<void> {
        const onProgress = options.onProgress;

        const onTargetProgress: undefined | ((message: ProgressMessage) => void) =
            // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
            onProgress ? (message) => onProgress(targetIndex, message) : undefined;

        const virtualModules = new VirtualModules();

        const include = (await fs.readJson(ps.join(options.rootDir, 'cc.config.json'))).includes as string[];
        const files: string[] = [];

        const includeFiles = await globby(include, {
            cwd: options.rootDir,
            absolute: true,
        });
        files.push(...includeFiles.map((file) => encodeFilePath(file, options.rootDir) ?? file));

        const entryAliases = await getTargetPubEntries(targetOptions);

        if (targetOptions.includeIndex) {
            const featureUnits = statsQuery.getUnitsOfFeatures(targetOptions.includeIndex.features);
            logger.debug(`Modules involved in 'cc': ${featureUnits}`);
            const indexModuleSource = statsQuery.evaluateIndexModuleSource(
                featureUnits, (featureUnit) => statsQuery.getFeatureUnitFile(featureUnit).replace(/\\/g, '\\\\'));
            logger.debug(`The source of 'cc':\n${indexModuleSource}`);
            const vmIndex = encodeVirtualFileUid('cc');
            virtualModules.set('cc', indexModuleSource);
            entryAliases['cc'] = vmIndex;
        }

        files.push(...Object.values(entryAliases));

        const changedFiles = await detectChangedFiles({
            rootDir,
            entries: files,
            targetRecord,
            bundler,
            fsCache,
        });

        const chunkDir = ps.join(targetOptions.dir, 'external');

        if (changedFiles.length === 0) {
            logger.debug(`Seems like target ${targetIndex} has already up to date.`);
            return;
        }

        await (await import('./core.js')).core({
            rootDir,
            statsQuery,
            entries: changedFiles,
            targetRecord,
            targetOptions,
            bundler,
            chunkDir,
            fsCache,
            vm: virtualModules,
            logger,
            onProgress: onTargetProgress,
            platform,
        });

        const label = `QuickCompiler:Bundling target ${targetIndex}`;
        console.time(label);
        onTargetProgress?.({
            stage: Stage.bundle,
        });
        await bundler.build(Object.assign({
            outDir: ps.join(targetOptions.dir, 'bundled'),
            sourceRoot: rootDir,
        }, targetOptions));
        console.timeEnd(label);

        if (targetOptions.loader) {
            await fs.copyFile(
                ps.join(__dirname, '..', 'static', 'loader.js'),
                ps.join(targetOptions.dir, 'loader.js'),
            );
        }

        await writeTargetImportMap(targetOptions, targetRecord, entryAliases, bundler, chunkDir);
    }

    async function getTargetPubEntries(targetOptions: TargetOptions): Promise<Record<string, string>> {
        const entryAliases: Record<string, string> = {};

        for (const featureUnit of statsQuery.getFeatureUnits()) {
            entryAliases[`${targetOptions.featureUnitPrefix ?? ''}${featureUnit}`] = statsQuery.getFeatureUnitFile(featureUnit);
        }

        if (targetOptions.includeEditorExports ?? true) {
            for (const editorPublicModule of statsQuery.getEditorPublicModules()) {
                entryAliases[editorPublicModule] = statsQuery.getEditorPublicModuleFile(editorPublicModule);
            }
        }

        for (const [k, v] of Object.entries(entryAliases)) {
            const uid = encodeFilePath(v, rootDir);
            if (!uid) {
                throw new Error(`Entry ${v} is not under engine root.`);
            } else {
                entryAliases[k] = uid;
            }
        }

        return entryAliases;
    }

    async function writeTargetImportMap(
        targetOptions: TargetOptions,
        targetRecord: TargetRecord,
        entryAliases: Record<string, string>,
        bundler: IBundler,
        chunkDir: string,
    ): Promise<void> {
        const importMap: ImportMap & { imports: NonNullable<ImportMap['imports']> } = { imports: {} };
        const importMapFile = ps.join(targetOptions.dir, 'partial-import-map.json');

        for (const [alias, entry] of Object.entries(entryAliases)) {
            const finalUrl = bundler.getFinalUrl(entry);
            if (typeof finalUrl === 'string') {
                importMap.imports[alias] = finalUrl;
            } else {
                const relUrl = urlRelative(pathToFileURL(importMapFile), pathToFileURL(finalUrl.path));
                importMap.imports[alias] = relUrl;
            }
        }

        const chunkBaseURL = urlRelative(pathToFileURL(importMapFile), pathToFileURL(chunkDir));
        for (const [alias, chunkRelativeURL] of Object.entries(targetRecord.externalDependencyImportMap)) {
            importMap.imports[alias] = `./${chunkBaseURL}/${chunkRelativeURL}`;
        }

        await fs.ensureDir(ps.dirname(importMapFile));
        await fs.writeFile(importMapFile, JSON.stringify(importMap, undefined, 4));
    }
}

class EditorTransport extends Transport {
    log(info: any, callback: () => void): void {
        setImmediate(() => {
            this.emit('logged', info);
        });

        const MESSAGE = Symbol.for('message');
        const LEVEL = Symbol.for('level');
        const {
            [MESSAGE]: message,
            [LEVEL]: level,
        } = info;

        let consoleX:
            | typeof console.log
            | typeof console.warn
            | typeof console.debug
            | typeof console.error;

        switch (level) {
            case 'error':
                consoleX = console.error;
                break;
            case 'warn':
                consoleX = console.warn;
                break;
            case 'info':
            case 'http':
            default:
                consoleX = console.info;
                break;
            case 'verbose':
            case 'debug':
            case 'silly':
                consoleX = console.debug;
                break;
        }

        consoleX.call(console, message);

        callback();
    }
}

export class QuickCompiler {
    constructor(options: QuickCompileOptions) {
        this._options = Object.assign({}, options);
        this._bundlers = options.targets.map((targetOptions) => {
            return new ConcatBundler({
                cacheDir: ps.join(targetOptions.dir, 'transform-cache'),
                format: targetOptions.format,
            });
        });
    }

    public async build(): Promise<void> {
        await quickCompile(this._options, this._bundlers, await this._getOrCreateStatsQuery());
    }

    public async buildImportMap(targetIndex: number, features: string[], configurableFlags: Record<string, unknown>): Promise<void> {
        const options = this._options;
        const {
            rootDir,
        } = options;
        const statsQuery = await this._getOrCreateStatsQuery();
        const moduleOverrides = this._setupModuleOverrides(statsQuery, features, configurableFlags, options.platform);
        const target = options.targets[targetIndex];
        const bundler = this._bundlers[targetIndex];
        let importMap: ImportMap = {};
        try {
            importMap = await fs.readJson(
                ps.join(target.dir, 'partial-import-map.json'),
            );
        } catch (err) {
            console.error(`Failed to read engine build result. Please rebuild engine`);
            return;
        }
        for (const [k, v] of Object.entries(moduleOverrides)) {
            const targetUid = encodeFilePath(v, rootDir);
            if (!targetUid) {
                continue;
            }
            const targetModuleId = bundler.getModuleId?.(targetUid);
            if (!targetModuleId) {
                continue;
            }
            let sourceModuleId = k;
            const sourceUid = encodeFilePath(k, rootDir);
            if (sourceUid) {
                sourceModuleId = bundler.getModuleId?.(sourceUid) ?? '';
            }
            if (!sourceModuleId) {
                continue;
            }
            (importMap.imports ??= {})[sourceModuleId] = targetModuleId;
        }
        await fs.outputJson(
            ps.join(target.dir, 'import-map.json'),
            importMap,
            { spaces: 2 },
        );
    }

    private _options: QuickCompileOptions;
    private _bundlers: IBundler[];
    private _statsQuery: StatsQuery | null = null;

    private async _getOrCreateStatsQuery(): Promise<StatsQuery> {
        if (this._statsQuery) {
            return this._statsQuery;
        }
        const statsQuery = await StatsQuery.create(this._options.rootDir);
        this._statsQuery = statsQuery;
        return statsQuery;
    }

    private _setupModuleOverrides(
        statsQuery: StatsQuery,
        features: string[],
        configurableFlags: Record<string, unknown>,
        platform: Platform = 'HTML5',
    ): Record<string, string> {
        const mode = 'PREVIEW';
        const intrinsicFlags = statsQuery.getIntrinsicFlagsOfFeatures(features);
        let buildTimeConstants = statsQuery.constantManager.genBuildTimeConstants({
            mode,
            platform,
            flags: {
                DEBUG: true,
            },
        });

        buildTimeConstants = {
            ...buildTimeConstants,
            ...intrinsicFlags,
            ...configurableFlags,
        };
        const moduleOverrides = statsQuery.evaluateModuleOverrides({
            mode,
            platform,
            buildTimeConstants,
        });
        return moduleOverrides;
    }
}

export namespace QuickCompiler {
    export type Options = QuickCompileOptions;
}

type OptionsRecord = QuickCompileOptions;

function recordOptions(options: Readonly<QuickCompileOptions>): OptionsRecord {
    const record = Object.assign({}, options) as OptionsRecord;
    delete record.logFile;
    delete record.targetLaunchPolicy;
    return JSON.parse(JSON.stringify(record));
}

function matchOptionsRecord(record: OptionsRecord, options: OptionsRecord): boolean {
    return matchLhs(record, options);

    function matchLhs(lhs: unknown, rhs: unknown): boolean {
        if (Array.isArray(lhs)) {
            return Array.isArray(rhs) && lhs.length === rhs.length &&
                lhs.every((v, i) => matchLhs(v, rhs[i]));
        } else if (typeof lhs === 'object' && lhs !== null) {
            return typeof rhs === 'object'
                && rhs !== null
                && Object.keys(lhs).every((key) => matchLhs((lhs as any)[key], (rhs as any)[key]));
        } else if (lhs === null) {
            return rhs === null;
        } else {
            return lhs === rhs;
        }
    }
}

interface IncrementalRecord {
    version: string;
    targets: TargetRecord[];
    options: OptionsRecord;
}

