import ps from 'path';
import fs from 'fs-extra';
import { URL } from 'url';
import { ModLo, Specifier, ModuleType, isEqualMTimestamp, mTimestampToString, MTimestamp, ResolveResult } from '@cocos/creator-programming-mod-lo';
import { ErroneousModuleRecord, ModuleRecord, ModuleResolution, ResolutionMessage } from './utils/mod-record';
import { ChunkWriter } from './utils/chunk-io/writer';
import { ChunkUID } from './utils/chunk-id';
import { LoaderContext } from './utils/loader-context';
import { createLogger, Logger, isCjsInteropUrl, getCjsInteropTarget, launchSequentially, parallelDiscarding,  } from '@cocos/creator-programming-common';
import { asserts, assertsNonNullable, tryParseURL, i18nTranslate, isBareSpecifier } from '@ccbuild/utils';
import { Chunk, ChunkMessage } from './utils/chunk';
import { JavaScriptSource, cjsMetaUrlExportName } from '@cocos/creator-programming-mod-lo';
import { QuickPackMiddleware } from './middleware';

const getLauncher = (par: boolean) => par ? parallelDiscarding : launchSequentially;

// TODO: parallel
const ALL_PARALLEL = false;

const launchLinkDependencies = getLauncher(ALL_PARALLEL);
const launchInstantiateDependencies = getLauncher(ALL_PARALLEL);

interface BuildResult {
    depsGraph: Record<string, string[]>;
}

export class QuickPack {
    constructor({
        modLo,
        sourceMaps,
        origin,
        workspace,
        verbose,
        logger,
    }: {
        modLo: ModLo;
        sourceMaps?: boolean | 'inline';
        origin: string;
        workspace: string;
        verbose?: boolean;
        logger?: Logger;
    }) {
        this._verbose = verbose ?? false;
        this._middleware = new QuickPackMiddleware(workspace);
        this._origin = origin;
        this._modLo = modLo;
        this._sourceMaps = sourceMaps ?? true;
        const theLogger = logger ?? createLogger({});
        this._chunkWriter = new ChunkWriter({
            chunkHomePath: this._middleware.chunkHomePath,
            importMapPath: this._middleware.importMapPath,
            resolutionDetailMapPath: this._middleware.resolutionDetailMapPath,
            logger: theLogger,
        });
        this._logger = theLogger;
    }

    public async build(specifiers: Iterable<string | URL>, options?: {
        retryResolutionOnUnchangedModule?: boolean;
        cleanResolution?: boolean;
    }): Promise<BuildResult> {
        const context: InspectContext = {
            modules: new Map(),
            cleanResolution: options?.cleanResolution ?? false,
            retryResolutionOnUnchangedModule: options?.retryResolutionOnUnchangedModule ?? false,
        };
        const chunkAlias: Record<string, ChunkUID> = {};
        for (const specifier of specifiers) {
            const url = await this._resolveEntry(
                typeof specifier === 'string' ? specifier : specifier.href);
            if (!url) {
                continue;
            }
            const inspectRecord = await this._getOrCreateInspectRecord(url, context);
            await this._instantiateAll(inspectRecord, new Set());
            const moduleRecord = this._moduleRecords[url.href];
            if (!moduleRecord) {
                this._logger.debug(`Entry ${url} did not library a chunk.`);
                continue;
            }
            const chunk = await this._chunkWriter.getChunk(moduleRecord.chunkId);
            chunkAlias[typeof specifier === 'string' ? specifier : specifier.href] = moduleRecord.chunkId;
            asserts(chunk);
        }

        this._chunkWriter.setEntryChunks(chunkAlias);

        await this._middleware.lock();
        await this._chunkWriter.persist();

        const serializedMainRecord = this._serializeMainRecord();
        await fs.outputJson(this._middleware.mainRecordPath, serializedMainRecord, { encoding: 'utf8', spaces: 2 });

        const serializedAssemblyRecord = this._chunkWriter.serializeRecord();
        await fs.outputJson(this._middleware.assemblyRecordPath, serializedAssemblyRecord, { encoding: 'utf8', spaces: 2 });
        await this._middleware.unlock();

        return {
            depsGraph: this._getDepsGraphFromModuleRecords(),
        };
    }

    public async createLoaderContext() {
        return new LoaderContext(this._middleware.workspace);
    }

    public async clear() {
        this._moduleRecords = {};
        const recordFile = this._middleware.mainRecordPath;
        try {
            await fs.unlink(recordFile);
        } catch (err) {
            this._logger.debug(`Failed to delete record file ${recordFile}: ${err}`);
        }
        await this._chunkWriter.clear();
    }

    public async loadCache() {
        try {
            const serializedMainRecord: SerializedMainRecord = await fs.readJson(this._middleware.mainRecordPath);
            const serializedAssemblyRecord = await fs.readJson(this._middleware.assemblyRecordPath);
            this._deserializeMainRecord(serializedMainRecord);
            this._chunkWriter.deserializeRecord(serializedAssemblyRecord);
        } catch (err) {
            this._logger.debug(`Record file loaded failed with error: ${err}`);
        }
    }

    private _verbose: boolean;
    private _origin: string;
    private _modLo: ModLo;
    private _sourceMaps: boolean | 'inline';
    private _moduleRecords: Record<string, ModuleRecord | ErroneousModuleRecord | null> = {};
    private _chunkWriter: ChunkWriter;
    private _logger: Logger;
    private _middleware: QuickPackMiddleware;

    private async _resolveEntry(specifier: string) {
        try {
            const resolved = await this._modLo.resolve(specifier, undefined, 'esm');
            if (resolved.isExternal) {
                this._logger.error(`Entry(${specifier}) shall not be resolved to an external.`);
                return;
            } else {
                return resolved.url;
            }
        } catch (err) {
            this._logger.error(i18nTranslate('quick_pack_could_not_resolve_entry', { specifier }));
            return;
        }
    }

    private async _getOrCreateInspectRecord(url: URL, context: InspectContext) {
        const existedInspectRecord = context.modules.get(url.href);
        if (existedInspectRecord) {
            return existedInspectRecord;
        }

        // eslint-disable-next-line prefer-const
        let inspectRecord: InspectRecord;

        const inspectPromise = this._inspectWithCache(url);
        const linkPromise = inspectPromise.then(async (moduleInspectInfo) => {
            if (moduleInspectInfo) {
                if (moduleInspectInfo.moduleRecord.erroneous) {
                    // If the module is erroneous, we can't link it.
                } else {
                    const dependencies = await this._link(url, moduleInspectInfo.moduleRecord, context);
                    inspectRecord.dependencies = dependencies;
                }
            }
        });

        inspectRecord = {
            inspect: inspectPromise,
            link: linkPromise,
            dependencies: undefined,
        };
        context.modules.set(url.href, inspectRecord);

        // Optional, `ALL_PARALLEL` makes debugging easier.
        if (!ALL_PARALLEL) {
            await linkPromise;
        }
        
        return inspectRecord;
    }

    private async _instantiateAll(inspectRecord: InspectRecord, visited: Set<InspectRecord>) {
        if (visited.has(inspectRecord)) {
            return;
        }
        visited.add(inspectRecord);
        await inspectRecord.link;
        if (inspectRecord.dependencies) {
            await launchInstantiateDependencies(inspectRecord.dependencies, async (dependency) => {
                if (dependency) {
                    await this._instantiateAll(dependency, visited);
                }
            });
        }
    }

    private async _inspectWithCache(url: URL) {
        let mTimestamp: MTimestamp;
        try {
            mTimestamp = await this._modLo.getMTimestamp(url);
        } catch (err) {
            // If error was thrown when query the mtime, we ignore it and suppose the time as current time.
            // This makes so that if the module is erroneous finally, it will be reload in next time.
            mTimestamp = Date.now();
        }

        const oldModuleRecord = this._moduleRecords[url.href];
        if (oldModuleRecord) {
            if (isEqualMTimestamp(mTimestamp, oldModuleRecord.mTimestamp)) {
                return { moduleRecord: oldModuleRecord, updated: false };
            }
            this._logger.debug(`Detected change: ${url}. Last mtime: ${mTimestampToString(oldModuleRecord.mTimestamp)}, Current mtime: ${mTimestampToString(mTimestamp)}`);
            this._moduleRecords[url.href] = null;
            await this._chunkWriter.removeChunk(oldModuleRecord.chunkId);
        }

        if (this._verbose) {
            this._logger.debug(`Inspect ${url}`);
        }

        const moduleRecord = await this._inspect(url, mTimestamp).catch((err) => {
            this._logger.error(err);
        });
        if (!moduleRecord) {
            return undefined;
        }

        return { moduleRecord, updated: true };
    }

    private async _link(url: URL, moduleRecord: ModuleRecord, context: InspectContext) {
        const chunkImports: Chunk['imports'] = {};

        if (context.cleanResolution) {
            moduleRecord.resolutions = undefined;
        }

        let forceResolve = false;
        if (!moduleRecord.resolutions) {
            forceResolve = true;
            moduleRecord.resolutions = new Array(moduleRecord.imports.length).fill(null);
        }

        const resolutions = moduleRecord.resolutions;

        const depRecords = await launchLinkDependencies(moduleRecord.imports, async (specifier, iImport): Promise<undefined | InspectRecord> => {
            let resolution = resolutions[iImport];
            if (forceResolve || // Not resolved before
                resolution.resolved.type === 'error' && context.retryResolutionOnUnchangedModule // Resolved but failed
            ) {
                resolution = await this._resolve(specifier, url, moduleRecord.type);
                resolutions[iImport] = resolution;
            }
            assertsNonNullable(resolution);

            const chunkImportKey = specifier.resolved ?? specifier.value;

            if (resolution.resolved.type === 'error') {
                chunkImports[chunkImportKey] = {
                    resolved: { type: 'error', text: resolution.resolved.text },
                    messages: resolution.messages.slice(),
                };
                return;
            }

            if (resolution.resolved.type === 'external') {
                const isResolvedToBare = !tryParseURL(resolution.resolved.specifierOrURL);
                if (isResolvedToBare) {
                    // Only bare specifier may resolved to bare
                    asserts(!specifier.resolved, `Something wrong with rewriting and resolve ${specifier.value}`);
                    return;
                }
                chunkImports[chunkImportKey] = {
                    resolved: {
                        type: 'external',
                        specifierOrURL: resolution.resolved.specifierOrURL,
                    },
                    messages: resolution.messages.slice(),
                };
                return;
            }

            asserts(resolution.resolved.type === 'module');
            const { url: resolvedURL } = resolution.resolved;

            const inspectRecord = await this._getOrCreateInspectRecord(resolvedURL, context);
            await inspectRecord.inspect;

            const resolvedChunk = this._moduleRecords[resolvedURL.href]?.chunkId;
            if (resolvedChunk) {
                chunkImports[chunkImportKey] = {
                    resolved: {
                        type: 'chunk',
                        id: resolvedChunk,
                    },
                    messages: resolution.messages.slice(),
                };
            } else {
                this._logger.debug(`We're missing the chunk ${resolvedURL.href}, referenced as '${specifier.value}'.`);
            }

            return inspectRecord;
        });

        const chunk = await this._chunkWriter.getChunk(moduleRecord.chunkId);
        asserts(chunk);
        chunk.imports = Object.keys(chunkImports).sort().reduce((result, k) => {
            result[k] = chunkImports[k];
            return result;
        }, {} as typeof chunkImports);

        return depRecords;
    }

    private async _inspect(url: URL, mTimestamp: MTimestamp) {
        const resolver = this._createResolver();

        let jsSource: JavaScriptSource;
        let specifiers: Specifier[];
        let type: ModuleType;
        try {
            const mod = await this._modLo.load(url);
            type = mod.type;
            ({
                source: jsSource,
                moduleSpecifiers: specifiers,
            } = await mod.systemjs(resolver));
        } catch (err) {
            this._logger.debug(`We encountered an load error: ${err}`);
            const chunkId = await this._addErroneousChunk(url, err);
            const moduleRecord: ErroneousModuleRecord = {
                erroneous: true,
                mTimestamp,
                chunkId,
            };
            this._moduleRecords[url.href] = moduleRecord;
            return moduleRecord;
        }

        const chunkId = await this._addChunk(url, jsSource);

        const moduleRecord: ModuleRecord = {
            mTimestamp,
            chunkId,
            imports: specifiers,
            type,
        };

        this._moduleRecords[url.href] = moduleRecord;

        return moduleRecord;
    }

    private _createResolver() {
        let nSpecifier = 0;
        const resolver = (specifier: string) => {
            if (isBareSpecifier(specifier)) {
                // If it's bare specifier, we do not rewrite it.
                return undefined;
            }
            const rewritten = `__unresolved_${nSpecifier}`;
            ++nSpecifier;
            return rewritten;
        };
        return resolver;
    }

    private async _addChunk(url: URL, jsSource: JavaScriptSource) {
        const { code, map } = jsSource;
        
        const chunkId = await this._chunkWriter.addChunk(
            url,
            code,
            this._sourceMaps ? map : undefined,
        );

        return chunkId;
    }

    private async _addErroneousChunk(url: URL, err: unknown) {
        const reporterModuleSource = `
// This module is auto-generated to report error emitted when try to load module ${url} at runtime.
throw new Error(\`${String(err)}\`);
        `;

        const data64URL = new URL(`data:text/javascript,${encodeURIComponent(reporterModuleSource)}`);

        // Should not fail
        const reporterModule = await this._modLo.load(data64URL);

        const { source: reporterModuleSourceTransformed } = await reporterModule.systemjs();

        const chunkId = this._chunkWriter.addChunk(data64URL, reporterModuleSourceTransformed.code, reporterModuleSourceTransformed.map);

        return chunkId;
    }

    private async _resolve(specifier: Specifier, parentURL: URL, type: ModuleType): Promise<ModuleResolution> {
        const messages: ChunkMessage[] = [];
        const specifierValue = specifier.value;
        try {
            const resolved = await this._modLo.resolve(specifierValue, parentURL, type);
            if (this._verbose) {
                if (resolved.isExternal) {
                    this._logger.debug(`Resolve ${specifierValue} from ${parentURL.href} as external dependency ${resolved.specifierOrURL}.`);
                } else {
                    this._logger.debug(`Resolve ${specifierValue} from ${parentURL.href} as ${resolved.url}.`);
                }
            }
            return {
                resolved: resolved.isExternal ? {
                    type: 'external',
                    specifierOrURL: resolved.specifierOrURL,
                } : {
                    type: 'module',
                    url: resolved.url,
                },

                messages,
            };
        } catch (err) {
            this._logger.debug(
                `Failed to resolve '${specifier.value}' from '${parentURL.href}'(module type: ${type}). Reason: ${err}`);
            // messages.push({
            //     level: 'error',
            //     text: i18nTranslate(
            //         'quick_pack_failed_to_resolve',
            //         { specifier: specifierValue, parentURL: parentURL.href, cause: err },
            //     ),
            // });

            // If we can't resolve a bare specifier from CommonJS, treat it as external
            if (isBareSpecifier(specifier.value) && type === 'commonjs') {
                return {
                    resolved: {
                        type: 'module',
                        url: new URL(`data:text/javascript,${encodeURIComponent(`
                        export const ${cjsMetaUrlExportName} = '${specifier.value}';
                        `)}`),
                    },
                    messages,
                };
            }

            // For otherwise errors, we deliver them to "messages".
            if (specifierValue.includes('/')) {
                const lastPortion = specifierValue.split('/').pop();
                if (lastPortion && !lastPortion.includes('.')) {
                    messages.push({
                        level: 'warn',
                        text: i18nTranslate('resolve_error_hint_extension'),
                    });
                }
            }
            return {
                resolved: {
                    type: 'error',
                    text: String(err),
                },
                messages,
            };
        }
    }

    private _serializeMainRecord(): SerializedMainRecord {
        return {
            modules: Object.entries(this._moduleRecords).reduce((result, [key, moduleRecord]) => {
                if (moduleRecord) {
                    result[key] = moduleRecord;
                }
                return result;
            }, {} as Record<string, ModuleRecord | ErroneousModuleRecord>),
        };
    }

    private _deserializeMainRecord(serialized: SerializedMainRecord) {
        const moduleRecords = this._moduleRecords = serialized.modules;
        for (const moduleRecord of Object.values(moduleRecords)) {
            if (!moduleRecord.erroneous && moduleRecord.resolutions) {
                for (const resolution of moduleRecord.resolutions) {
                    if (resolution.resolved.type === 'module') {
                        resolution.resolved.url = new URL(resolution.resolved.url as unknown as string);
                    }
                }
            }
        }
    }

    /**
     * This method should be called after all modules are instantiated.
     */
    private _getDepsGraphFromModuleRecords () {
        const depGraphs: Record<string, string[]> = {};
        for (const k in this._moduleRecords) {
            const mr: ModuleRecord = this._moduleRecords[k] as ModuleRecord;
            if (mr.resolutions) {
                depGraphs[k] = mr.resolutions.map((res) => {
                    const resolved = res.resolved;
                    switch (resolved.type) {
                        case 'module':
                            if (isCjsInteropUrl(resolved.url)) {
                                return getCjsInteropTarget(resolved.url).href;
                            }
                            return resolved.url.href;
                        case 'external':
                            return resolved.specifierOrURL;
                        case 'error':
                        default:
                            return undefined;
                    }
                    // NOTE: filter undefined value and de-duplication
                }).filter((depPath, index, arr) => depPath !== undefined && arr.indexOf(depPath) === index) as string[];
            }
        }

        return depGraphs;
    }
}

interface InspectRecord {
    inspect: Promise<{ moduleRecord: ModuleRecord | ErroneousModuleRecord; updated: boolean; } | undefined>;
    link: Promise<void> | undefined;
    dependencies: Array<InspectRecord | undefined> | undefined;
}

interface InspectContext {
    cleanResolution: boolean;
    retryResolutionOnUnchangedModule: boolean;
    modules: Map<string, InspectRecord>;
}

interface SerializedMainRecord {
    modules: Record<string, ModuleRecord | ErroneousModuleRecord>;
}
