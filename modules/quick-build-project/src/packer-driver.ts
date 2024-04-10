
import ps from 'path';
import fs from 'fs-extra';
import { pathToFileURL, URL } from 'url';
import { performance } from 'perf_hooks';

import { PackTarget } from './pack-target';
import { editorBrowserslistQuery } from '@ccbuild/utils';
import { StatsQuery } from '@ccbuild/stats-query';

//cjh import { querySharedSettings, SharedSettings } from '../shared/query-shared-settings';
import { SharedSettings, AssetChange, AssetChangeType, AssetDatabaseDomain, EngineInfo, ImportRestriction } from '@ccbuild/utils';
import { Logger } from '@cocos/creator-programming-common';
import { QuickPack, QuickPackLoaderContext } from '@cocos/creator-programming-quick-pack';
import { IPackerDriverCallbacks } from './types';

import { ModLo, ModLoOptions } from '@cocos/creator-programming-mod-lo';

import { PackerDriverLogger } from './logger';

//cjh import { LanguageServiceAdapter } from '../language-service';
// import { DbURLInfo, getInternalCompilerOptions, getInternalDbURLInfos, realTsConfigPath } from '../intelligence';
// import { AsyncDelegate } from '../utils/delegate';

// import JSON5 from 'json5';

const VERSION = '20';

const featureUnitModulePrefix = 'cce:/internal/x/cc-fu/';


// async function getEditorPatterns(): Promise<string[]> {
    // const dbList: string[] = await Editor.Message.request('asset-db', 'query-db-list');
    //cjh for (const dbID of dbList) {
    //     const dbInfo = await Editor.Message.request('asset-db', 'query-db-info', dbID);
    //     const dbEditorPattern = ps.join(dbInfo.target, '**', 'editor', '**/*');
    //     editorPatterns.push(dbEditorPattern);
    // }
    // return editorPatterns;
// }

interface IncrementalRecord {
    version: string;
    config: {
        previewTarget?: string;
    } & SharedSettings;
}

export interface CCEModuleConfig {
    description: string;
    main: string;
    types: string;
}

export type CCEModuleMap = {
    [moduleName: string]: CCEModuleConfig;
} & {
    mapLocation: string;
};

export interface PackerDriverOptions {
    workspace: string;
    projectPath: string;
    engineInfo: EngineInfo;
    cceModuleMap: CCEModuleMap;
    callbacks: IPackerDriverCallbacks;
}

function getCCEModuleIDs(cceModuleMap: CCEModuleMap): string[] {
    return Object.keys(cceModuleMap).filter(id => id !== 'mapLocation');
}

/**
 * Packer 驱动器。
 * - 底层用 QuickPack 快速打包模块相关的资源。
 * - 监听涉及到的所有模块变动并重进行打包，包括：
 *   - asset-db 代码相关资源的变动。
 *   - 引擎设置变动。
 * - 产出是可以进行加载的模块资源，包括模块、Source map等；需要使用 QuickPackLoader 对这些模块资源进行加载和访问。
 */
export class PackerDriver {
    // public languageService: LanguageServiceAdapter;

    /**
     * 创建 Packer 驱动器。
     */
    public static async create(options: PackerDriverOptions): Promise<PackerDriver> {
        const baseWorkspace = options.workspace;
        const versionFile = ps.join(baseWorkspace, 'VERSION');
        const targetWorkspaceBase = ps.join(baseWorkspace, 'targets');
        const debugLogFile = ps.join(baseWorkspace, 'logs', 'debug.log');

        const targets: PackerDriver['_targets'] = {};

        const verbose = true;
        if (await fs.pathExists(debugLogFile)) {
            try {
                await fs.unlink(debugLogFile);
            } catch (err) {
                console.warn(`Failed to reset log file: ${debugLogFile}`);
            }
        }

        const logger = new PackerDriverLogger(debugLogFile);

        logger.debug(new Date().toLocaleString());
        logger.debug(`Project: ${options.projectPath}`);
        logger.debug(`Targets: ${Object.keys(predefinedTargets)}`);

        const incrementalRecord = await PackerDriver._createIncrementalRecord(logger, options.callbacks);

        await PackerDriver._validateIncrementalRecord(
            incrementalRecord,
            versionFile,
            targetWorkspaceBase,
            logger,
        );

        const loadMappings: Record<string, string> = {
            'cce:/internal/code-quality/': pathToFileURL(
                ps.join(__dirname, '..', '..', 'static', 'builtin-mods', 'code-quality', '/')).href,
        };

        const { engineInfo } = options;
        const { path: engineRoot } = engineInfo.typescript;
        logger.debug(`Engine path: ${engineRoot}`);

        const statsQuery = await StatsQuery.create(engineRoot);

        const emptyEngineIndexModuleSource = statsQuery.evaluateIndexModuleSource([]);

        const crOptions: ModLoOptions['cr'] = {
            moduleRequestFilter: [/^cc\.?.*$/g],
            reporter: {
                moduleName: 'cce:/internal/code-quality/cr.mjs',
                functionName: 'report',
            },
        };

        for (const [targetId, target] of Object.entries(predefinedTargets)) {
            logger.debug(`Initializing target [${target.name}]`);

            const modLoExternals: string[] = [
                'cc/env',
                'cc/userland/macro',
                ...getCCEModuleIDs(options.cceModuleMap), // 设置编辑器导出的模块为外部模块
            ];

            modLoExternals.push(...statsQuery.getFeatureUnits().map(
                (featureUnit) => `${featureUnitModulePrefix}${featureUnit}`));

            let browsersListTargets = target.browsersListTargets;
            if (targetId === 'preview' && incrementalRecord.config.previewTarget) {
                browsersListTargets = incrementalRecord.config.previewTarget;
                logger.debug(`Use specified preview browserslist target: ${browsersListTargets}`);
            }
            const modLo = new ModLo({
                targets: browsersListTargets,
                loose: incrementalRecord.config.loose,
                guessCommonJsExports: incrementalRecord.config.guessCommonJsExports,
                useDefineForClassFields: incrementalRecord.config.useDefineForClassFields,
                allowDeclareFields: incrementalRecord.config.allowDeclareFields,
                cr: crOptions,
                _compressUUID(uuid: string): string {
                    return options.callbacks.onCompressUUID(uuid, false);
                },
                logger,
                checkObsolete: true,
                importRestrictions: PackerDriver._importRestrictions,
                preserveSymlinks: incrementalRecord.config.preserveSymlinks,
            });

            modLo.setExtraExportsConditions(incrementalRecord.config.exportsConditions);
            modLo.setExternals(modLoExternals);
            modLo.setLoadMappings(loadMappings);

            const targetWorkspace = ps.join(targetWorkspaceBase, targetId);
            const origin = options.projectPath;
            const quickPack = new QuickPack({
                modLo,
                origin,
                workspace: targetWorkspace,
                logger,
                verbose,
            });

            logger.debug('Loading cache');
            const t1 = performance.now();
            await quickPack.loadCache();
            const t2 = performance.now();
            logger.debug(`Loading cache costs ${t2 - t1}ms.`);

            let engineIndexModule:
                ConstructorParameters<typeof PackTarget>[0]['engineIndexModule'];
            if (target.isEditor) {
                const features = await PackerDriver._getEngineFeaturesShippedInEditor(statsQuery);
                logger.debug(`Engine features shipped in editor: ${features}`);
                engineIndexModule = {
                    source: PackerDriver._getEngineIndexModuleSource(statsQuery, features),
                    respectToFeatureSetting: false,
                };
            } else {
                engineIndexModule = {
                    source: emptyEngineIndexModuleSource,
                    respectToFeatureSetting: true,
                };
            }

            const quickPackLoaderContext = await quickPack.createLoaderContext();
            targets[targetId] = new PackTarget({
                name: targetId,
                modLo,
                sourceMaps: target.sourceMaps,
                quickPack,
                quickPackLoaderContext,
                logger,
                engineIndexModule,
                tentativePrerequisiteImportsMod: target.isEditor ?? false,
                userImportMap: incrementalRecord.config.importMap ? {
                    json: incrementalRecord.config.importMap.json,
                    url: new URL(incrementalRecord.config.importMap.url),
                } : undefined,
                callbacks: options.callbacks,
            });
        }

        const packer = new PackerDriver({
            targets,
            statsQuery,
            logger,
            cceModuleMap: options.cceModuleMap,
            callbacks: options.callbacks,
            //cjh await getInternalCompilerOptions(),
            // await getInternalDbURLInfos()
        });
        return packer;
    }

    public static getImportRestrictions(): ImportRestriction[] {
        return PackerDriver._importRestrictions;
    }

    // public static async updateImportRestrictions(): Promise<void> {
        // if (!useEditorFolderFeature) {
        //     return;
        // }

        //cjh const dbList: string[] = await Editor.Message.request('asset-db', 'query-db-list');
        // const restrictions = PackerDriver._importRestrictions;
        // restrictions.length = 0;
        // const banSourcePatterns = await getEditorPatterns();
        // banSourcePatterns.push(...getCCEModuleIDs(PackerDriver._cceModuleMap)); // 禁止从这些模块里导入

        // for (let i = 0; i < dbList.length; ++i) {
        //     const dbID = dbList[i];
        //     const dbInfo = await Editor.Message.request('asset-db', 'query-db-info', dbID);
        //     const dbPattern = ps.join(dbInfo.target, '**/*');
        //     const dbEditorPattern = ps.join(dbInfo.target, '**', 'editor', '**/*');
        //     restrictions[i] = {
        //         importerPatterns: [dbPattern, '!' + dbEditorPattern], // TODO: 如果需要兼容就项目，则路径不能这么配置，等编辑器提供查询接口
        //         banSourcePatterns,
        //     };
        // }
    // }

    // public static queryCCEModuleMap(): CCEModuleMap {
    //     const cceModuleMapLocation = ps.join(__dirname, '../../cce-module.jsonc');
    //     const cceModuleMap = JSON5.parse(fs.readFileSync(cceModuleMapLocation, 'utf8')) as CCEModuleMap;
    //     cceModuleMap.mapLocation = cceModuleMapLocation;
    //     return cceModuleMap;
    // }

    /**构建任务的委托，在构建之前会把委托里面的所有内容执行 */
    //cjh public readonly beforeEditorBuildDelegate: AsyncDelegate<(changes: ModifiedAssetChange[]) => Promise<void>> = new AsyncDelegate();
    
    public busy(): boolean {
        return this._asyncIteration.busy();
    }

    public setAssetDatabaseDomains(assetDatabaseDomains: AssetDatabaseDomain[]): void {
        for (const target of Object.values(this._targets)) {
            target.setAssetDatabaseDomains(assetDatabaseDomains);
        }
    } 

    //cjh public async mountDatabase(dbName: string): Promise<void> {
    //     const assetChanges = await this._assetDbInterop.fetch(dbName);
    //     this._assetChangeQueue.push(...assetChanges);
    //     await this._assetDbInterop.onMountDatabase(dbName);
    //     await PackerDriver.updateImportRestrictions();
    // }

    // public async unmountDatabase(dbName: string): Promise<void> {
    //     this._assetDbInterop.onUnmountDatabase(dbName);
    //     await PackerDriver.updateImportRestrictions();
    // }
    //
    // public async resetDatabases(build = true): Promise<void> {
    //     const assetDatabaseDomains = await this._assetDbInterop.queryAssetDomains();
    //     this._logger.debug(
    //         'Reset databases. ' +
    //         `Enumerated domains: ${JSON.stringify(assetDatabaseDomains, undefined, 2)}`);

    //     const setTargets = (): void => {
    //         for (const target of Object.values(this._targets)) {
    //             target.setAssetDatabaseDomains(assetDatabaseDomains);
    //         }
    //     };

    //     if (build) {
    //         this._triggerNextBuild(setTargets);
    //     } else {
    //         setTargets();
    //     }
    // }
    //
    // /**
    //  * 从 asset-db 获取所有数据并构建。
    //  */
    // public async pullAssetDb(): Promise<void> {
    //     const logger = this._logger;

    //     logger.debug('Pulling asset-db.');

    //     const t1 = performance.now();
    //     await this._fetchAll();
    //     const t2 = performance.now();

    //     logger.debug(`Fetch asset-db cost: ${t2 - t1}ms.`);

    //     await this._waitForBuild();
    //     return;
    // }

    public async clearCache(): Promise<void> {
        if (this._clearing) {
            this._logger.debug('Failed to clear cache: previous clearing have not finished yet.');
            return;
        }
        if (this.busy()) {
            this._logger.error('Failed to clear cache: the building is still working in progress.');
            return;
        }
        this._clearing = true;
        for (const [name, target] of Object.entries(this._targets)) {
            this._logger.debug(`Clear cache of target ${name}`);
            await target.clearCache();
        }
        this._logger.debug('Request build after clearing...');
        this.dispatchBuildRequest();
        this._clearing = false;
    }

    public getQuickPackLoaderContext(targetName: TargetName): QuickPackLoaderContext | undefined {
        this._warnMissingTarget(targetName);
        if (targetName in this._targets) {
            return this._targets[targetName].quickPackLoaderContext;
        } else {
            return undefined;
        }
    }

    public isReady(targetName: TargetName): boolean | undefined {
        this._warnMissingTarget(targetName);
        if (targetName in this._targets) {
            return this._targets[targetName].ready;
        } else {
            return undefined;
        }
    }

    public async queryScriptDeps(scriptUrl: string): Promise<string[]> {
        await this._transformDepsGraph();
        return this._depsGraph[scriptUrl] ?? [];
    }

    public async shutDown(): Promise<void> {
        await this.destroyed();
    }

    private _clearing = false;
    private _targets: Record<TargetName, PackTarget> = {};
    private _logger: PackerDriverLogger;
    private _statsQuery: StatsQuery;
    private _asyncIteration: AsyncIterationConcurrency1;
    //cjh private readonly _assetDbInterop: AssetDbInterop;
    private _assetChangeQueue: AssetChange[] = [];
    private _featureChanged = false;
    private _beforeBuildTasks: (() => void)[] = [];
    // private _broadcastListenerMap: Record<string, (...args: any[]) => void> = {};
    private _callbacks: IPackerDriverCallbacks;
    private _depsGraph: Record<string, string[]> = {};
    private _cceModuleMap: CCEModuleMap;
    private static _importRestrictions: ImportRestriction[] = [];
    private _init = false;

    // /*, compilerOptions: Readonly<ts.CompilerOptions>, dbURLInfos: readonly DbURLInfo[]*/
    private constructor({
        targets, 
        statsQuery, 
        logger,
        cceModuleMap,
        callbacks,
    }: {
        targets: PackerDriver['_targets'],
        statsQuery: StatsQuery,
        logger: PackerDriverLogger,
        cceModuleMap: CCEModuleMap,
        callbacks: IPackerDriverCallbacks,
    }) {
        this._targets = targets;
        this._statsQuery = statsQuery;
        this._logger = logger;
        this._cceModuleMap = cceModuleMap;
        this._callbacks = callbacks;
        //cjh this.languageService = new LanguageServiceAdapter(realTsConfigPath, Editor.Project.path, this.beforeEditorBuildDelegate, compilerOptions, dbURLInfos);
        // this._assetDbInterop = new AssetDbInterop(this._onSomeAssetChangesWereMade.bind(this));

        this._asyncIteration = new AsyncIterationConcurrency1(async () => {
            return await this._startBuildIteration();
        });

    }

    async init(): Promise<void> {
        if (this._init) {
            return;
        }
        this._init = true;
        await this._callbacks.onInit();
        //cjh this._broadcastListenerMap['engine:modules-changed'] = () => this._onEngineFeaturesChanged();
        //cjh Object.keys(this._broadcastListenerMap).forEach((message) => Editor.Message.__protected__.addBroadcastListener(message, this._broadcastListenerMap[message]));
        //cjh await this._assetDbInterop.init();
        await this._syncEngineFeatures();
    }

    async destroyed(): Promise<void> {
        if (!this._init) {
            return;
        }
        this._init = false;
        await this._callbacks.onDestroy();
        //cjh Object.keys(this._broadcastListenerMap).forEach((message) => Editor.Message.__protected__.removeBroadcastListener(message, this._broadcastListenerMap[message]));
        // this._broadcastListenerMap = {};
        // await this._assetDbInterop.destroyed();
    }

    public get logger(): Logger {
        return this._logger;
    }

    private _warnMissingTarget(targetName: TargetName): void {
        if (!(targetName in this._targets)) {
            console.warn(`Invalid pack target: ${targetName}. Existing targets are: ${Object.keys(this._targets)}`);
        }
    }

    public updateAssetChangeList(changes: ReadonlyArray<AssetChange>): void {
        this._assetChangeQueue.push(...changes);
    }

    public triggerNextBuild(beforeBuildTask: () => void): void {
        this._beforeBuildTasks.push(beforeBuildTask);
        this.dispatchBuildRequest();
    }

    /**
     * 请求一次构建，如果正在构建，会和之前的请求合并。
     */
    public async waitUnitlBuildFinish(): Promise<void> {
        return await this._asyncIteration.nextIteration();
    }

    /**
     * 请求一次构建，如果正在构建，会和之前的请求合并。
     */
    public dispatchBuildRequest(): void {
        void this._asyncIteration.nextIteration();
    }

    public getCCEModuleIDs(): string[] {
        return getCCEModuleIDs(this._cceModuleMap);
    }

    /**
     * 当资源更改计时器的时间到了之后，我们发起一次构建请求。
     */
    //cjh private _onSomeAssetChangesWereMade(changes: ReadonlyArray<AssetChange>) {
    //     this._logger.debug(
    //         `Dispatch build request for time accumulated ${changes.length} asset changes.`);
    //     this._assetChangeQueue.push(...changes);
    //     this._dispatchBuildRequest();
    // }

    /**
     * 当引擎功能变动后。
     */
    public notifyEngineFeaturesChanged(): void {
        this._featureChanged = true;
        this.dispatchBuildRequest();
    }

    /**
     * 开始一次构建。
     */
    private async _startBuildIteration(): Promise<void> {
        Editor.Metrics.trackTimeStart('programming:compile-start');
        Editor.Message.broadcast('programming:compile-start');
        this._logger.clear();
        this._logger.debug(
            'Build iteration starts.\n' +
            `Number of accumulated asset changes: ${this._assetChangeQueue.length}\n` +
            `Feature changed: ${this._featureChanged}`,
        );
        if (this._featureChanged) {
            this._featureChanged = false;
            await this._syncEngineFeatures();
        }
        const assetChanges = this._assetChangeQueue;
        this._assetChangeQueue = [];
        const beforeTasks = this._beforeBuildTasks.slice();
        this._beforeBuildTasks.length = 0;
        for (const beforeTask of beforeTasks) {
            beforeTask();
        }

        try {
            await this._callbacks.onBeforeBuild(assetChanges.filter(item => item.type === AssetChangeType.modified));
        } catch (err) {
            console.debug(err);
        }

        const nonDTSChanges = assetChanges.filter(item => !item.filePath.endsWith('.d.ts'));
        for (const [, target] of Object.entries(this._targets)) {
            if (assetChanges.length !== 0) {
                await target.applyAssetChanges(nonDTSChanges);
            }
            const buildResult = await target.build();
            this._depsGraph = buildResult.depsGraph; // 更新依赖图
        }

        Editor.Message.broadcast('programming:compiled');
        Editor.Metrics.trackTimeEnd('programming:compile-start');
    }

    private static async _createIncrementalRecord(logger: PackerDriverLogger, callbacks: IPackerDriverCallbacks): Promise<IncrementalRecord> {
        const sharedModLoOptions = await callbacks.onQuerySharedSettings(logger);

        const incrementalRecord: IncrementalRecord = {
            version: VERSION,
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore TODO(cjh):
            config: {
                ...sharedModLoOptions,
            },
        };

        const previewBrowsersListConfigFile = await (Editor.Profile.getProject(
            'project',
            'script.previewBrowserslistConfigFile',
        ) as Promise<string | undefined>);

        if (previewBrowsersListConfigFile) {
            const previewBrowsersListConfigFilePath = Editor.UI.__protected__.File.resolveToRaw(previewBrowsersListConfigFile);
            const previewTarget = await readBrowserslistTarget(previewBrowsersListConfigFilePath);
            if (previewTarget) {
                incrementalRecord.config.previewTarget = previewTarget;
            }
        }

        return incrementalRecord;
    }

    private static async _validateIncrementalRecord(
        record: IncrementalRecord,
        recordFile: string,
        targetWorkspaceBase: string,
        logger: Logger,
    ): Promise<boolean> {
        let matched = false;
        try {
            const oldRecord: IncrementalRecord = await fs.readJson(recordFile);
            matched = matchObject(record, oldRecord);
            if (matched) {
                logger.debug('Incremental file seems great.');
            } else {
                logger.debug(
                    '[PackerDriver] Options doesn\'t match.\n' +
                    `Last: ${JSON.stringify(record, undefined, 2)}\n` +
                    `Current: ${JSON.stringify(oldRecord, undefined, 2)}`,
                );
            }
        } catch (err) {
            logger.debug(`Packer deriver version file lost or format incorrect: ${err}`);
        }

        if (!matched) {
            logger.debug('Clearing out the targets...');
            await fs.emptyDir(targetWorkspaceBase);
            await fs.outputJson(recordFile, record, { spaces: 2 });
        }

        return matched;
    }

    private async _fetchAll(): Promise<void> {
        // const assetChanges = await this._assetDbInterop.fetchAll();
        // this._assetChangeQueue.push(...assetChanges);

    }

    private static async _getEngineFeaturesShippedInEditor(statsQuery: StatsQuery): Promise<string[]> {
        const editorFeatures: string[] = statsQuery.getFeatures().filter((featureName) => {
            return ![
                'physics-ammo',
                'physics-builtin',
                'physics-cannon',
                'physics-physx',
                'physics-2d-box2d',
                'physics-2d-builtin',
                'wait-for-ammo-instantiation',
            ].includes(featureName);
        });
        return editorFeatures;
    }

    private async _syncEngineFeatures(): Promise<void> {
        const features:string[] = await this._callbacks.onQueryIncludeModules();
        this._logger.debug(`Sync engine features: ${features}`);

        // 如果带 physics-2d-box2d 模块，需要决定使用哪个后端
        const index = features.findIndex(feature => feature.startsWith('physics-2d-box2d'));
        if (index !== -1) {
            // TODO：实验性的 wasm 模块，之后移除
            if (await Editor.Profile.getConfig('engine', 'physics-2d-box2d')) {
                features.splice(index, 1, 'physics-2d-box2d-wasm');
            } else {
                features.splice(index, 1, 'physics-2d-box2d');
            }
        }

        const engineIndexModuleSource = PackerDriver._getEngineIndexModuleSource(this._statsQuery, features);
        for (const [, target] of Object.entries(this._targets)) {
            if (target.respectToEngineFeatureSetting) {
                target.setEngineIndexModuleSource(engineIndexModuleSource);
            }
        }
    }

    private static _getEngineIndexModuleSource(statsQuery: StatsQuery, features: string[]): string {
        const featureUnits = statsQuery.getUnitsOfFeatures(features);
        const engineIndexModuleSource = statsQuery.evaluateIndexModuleSource(
            featureUnits,
            (featureUnit) => `${featureUnitModulePrefix}${featureUnit}`,
        );
        return engineIndexModuleSource;
    }

    /**
     * 将 depsGraph 从 file 协议转成 db 路径协议。
     * 并且过滤掉一些外部模块。
     */
    private async _transformDepsGraph(): Promise<void> {
        const transformed: Record<string, string[]> = {};
        for (const [scriptFilePath, depFilePaths] of Object.entries(this._depsGraph)) {
            const scriptDbPath = await this._callbacks.onTransformFilePathToDbPath(scriptFilePath);
            if (scriptDbPath) {
                const currentList = transformed[scriptDbPath] ??= [];
                for (const depFilePath of depFilePaths) {
                    const depDbPath = await this._callbacks.onTransformFilePathToDbPath(depFilePath);
                    if (depDbPath && !currentList.includes(depDbPath)) {
                        currentList.push(depDbPath);
                    }
                }
            }
        }
        this._depsGraph = transformed;
    }
}

type TargetName = string;
type PredefinedTargetName = 'editor' | 'preview';

interface PredefinedTarget {
    name: string;
    browsersListTargets?: ModLoOptions['targets'];
    sourceMaps?: boolean | 'inline';
    isEditor?: boolean;
}

const DEFAULT_PREVIEW_BROWSERS_LIST_TARGET = 'supports es6-module';

const predefinedTargets: Record<PredefinedTargetName, PredefinedTarget> = {
    editor: {
        name: 'Editor',
        browsersListTargets: editorBrowserslistQuery,
        sourceMaps: 'inline',
        isEditor: true,
    },
    preview: {
        name: 'Preview',
        sourceMaps: true,
        browsersListTargets: DEFAULT_PREVIEW_BROWSERS_LIST_TARGET,
    },
} as const;

async function readBrowserslistTarget(browserslistrcPath: string): Promise<string | undefined> {
    let browserslistrcSource: string;
    try {
        browserslistrcSource = await fs.readFile(browserslistrcPath, 'utf8');
    } catch (err) {
        return;
    }

    const queries = parseBrowserslistQueries(browserslistrcSource);
    if (queries.length === 0) {
        return;
    }

    return queries.join(' or ');

    function parseBrowserslistQueries(source: string) : string[]{
        const queries: string[] = [];
        for (const line of source.split('\n')) {
            const iSharp = line.indexOf('#');
            const lineTrimmed = (iSharp < 0 ? line : line.substr(0, iSharp)).trim();
            if (lineTrimmed.length !== 0) {
                queries.push(lineTrimmed);
            }
        }
        return queries;
    }
}

class AsyncIterationConcurrency1 {
    private _iterate: () => Promise<void>;

    private _executionPromise: Promise<void> | null = null;

    private _pendingPromise: Promise<void> | null = null;

    constructor(iterate: () => Promise<void>) {
        this._iterate = iterate;
    }

    public busy(): boolean {
        return !!this._executionPromise || !!this._pendingPromise;
    }

    public nextIteration(): Promise<void> {
        if (!this._executionPromise) {
            // 如果未在执行，那就去执行
            // assert(!this._pendingPromise)
            return this._executionPromise = Promise.resolve(this._iterate()).finally(() => {
                this._executionPromise = null;
            });
        } else if (!this._pendingPromise) {
            // 如果没有等待队列，创建等待 promise，在 执行 promise 完成后执行
            return this._pendingPromise = this._executionPromise.finally(() => {
                this._pendingPromise = null;
                // 等待 promise 将等待执行 promise，并在完成后重新入队
                return this.nextIteration();
            });
        } else {
            // 如果已经有等待队列，那就等待现有的队列
            return this._pendingPromise;
        }
    }
}

function matchObject(lhs: unknown, rhs: unknown): boolean {
    return matchLhs(lhs, rhs);

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
