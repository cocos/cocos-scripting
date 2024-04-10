import { makePrerequisiteImportsMod, makeTentativePrerequisiteImports, prerequisiteImportsModURL } from './prerequisite-imports';
import { ModLo, MemoryModule, ImportMap } from '@cocos/creator-programming-mod-lo';
import { QuickPack, QuickPackLoaderContext } from '@cocos/creator-programming-quick-pack';
import { Logger } from '@cocos/creator-programming-common';
import { fileURLToPath, pathToFileURL, URL } from 'url';
import { asserts, AssetChangeType, AssetChange, AssetDatabaseDomain } from '@ccbuild/utils';
import minimatch from 'minimatch';
import { IPackerDriverCallbacks } from './types';

import * as ps from 'path';

const useEditorFolderFeature = false; // TODO: 之后正式接入编辑器 Editor 目录后移除这个开关

const engineIndexModURL = 'cce:/internal/x/cc';

export interface ImportMapWithURL {
    json: ImportMap;
    url: URL;
}

export interface BuildResult {
    depsGraph: Record<string, string[]>;
}

export interface IPackTargetOptions {
    name: string;
    modLo: ModLo;
    sourceMaps?: boolean | 'inline';
    quickPack: QuickPack;
    quickPackLoaderContext: QuickPackLoaderContext;
    logger: Logger;
    tentativePrerequisiteImportsMod: boolean;
    engineIndexModule: {
        /**
         * `'cc'` 模块的初始内容。
         */
        source: string;

        /**
         * 这个目标的是否理会用户的引擎功能设置。
         * 如果是，`setEngineIndexModuleSource` 不会被调用。
         * 否则，当编辑器的引擎功能改变时，`setEngineIndexModuleSource` 会被调用以重新设置 `'cc'` 模块的内容。
         */
        respectToFeatureSetting: boolean;
    };
    userImportMap?: ImportMapWithURL;
    callbacks: IPackerDriverCallbacks;
}

function matchPattern(path: string, pattern: string): boolean {
    return minimatch(path.replace(/\\/g, '/'), pattern.replace(/\\/g, '/'));
}

export class PackTarget {
    constructor(options: IPackTargetOptions) {
        this._name = options.name;
        this._modLo = options.modLo;
        this._quickPack = options.quickPack;
        this._quickPackLoaderContext = options.quickPackLoaderContext;
        this._sourceMaps = options.sourceMaps;
        this._logger = options.logger;
        this._respectToFeatureSetting = options.engineIndexModule.respectToFeatureSetting;
        this._tentativePrerequisiteImportsMod = options.tentativePrerequisiteImportsMod;
        this._userImportMap = options.userImportMap;
        this._callbacks = options.callbacks;

        const modLo = this._modLo;
        this._entryMod = modLo.addMemoryModule(prerequisiteImportsModURL,
            (this._tentativePrerequisiteImportsMod ? makeTentativePrerequisiteImports : makePrerequisiteImportsMod)([]));
        this._engineIndexMod = modLo.addMemoryModule(engineIndexModURL, options.engineIndexModule.source);

        this.setAssetDatabaseDomains([]);
    }

    get quickPackLoaderContext(): QuickPackLoaderContext {
        return this._quickPackLoaderContext;
    }

    get ready(): boolean {
        return this._ready;
    }

    get respectToEngineFeatureSetting(): boolean {
        return this._respectToFeatureSetting;
    }

    public async build(): Promise<BuildResult> {
        this._ensureIdle();
        this._buildStarted = true;
        const targetName = this._name;
        Editor.Message.broadcast('programming:pack-build-start', targetName);
        Editor.Metrics.trackTimeStart(`programming:pack-build-start-${targetName}`);
        this._logger.debug(`Target(${targetName}) build started.`);

        let buildResult: BuildResult | undefined;
        const t1 = performance.now();
        try {
            const prerequisiteAssetMods = await this._getPrerequisiteAssetModsWithFilter();
            const buildEntries = [
                engineIndexModURL,
                prerequisiteImportsModURL,
                ...prerequisiteAssetMods,
            ];
            const cleanResolution = this._cleanResolutionNextTime;
            if (cleanResolution) {
                this._cleanResolutionNextTime = false;
            }
            if (cleanResolution) {
                console.debug('This build will perform a clean module resolution.');
            }
            buildResult = await this._quickPack.build(buildEntries, {
                retryResolutionOnUnchangedModule: this._firstBuild,
                cleanResolution: cleanResolution,
            });
            this._firstBuild = false;
        } catch (err) {
            this._logger.error(`${err}`);
        }
        const t2 = performance.now();
        this._logger.debug(`Target(${targetName}) ends with cost ${t2 - t1}ms.`);

        this._ready = true;
        // await new Promise<void>((resolve) => {
        //     setInterval(() => {
        //         if (globalThis.xx) {
        //             resolve();
        //         }
        //     }, 10);
        // });
        Editor.Message.broadcast('programming:pack-build-end', targetName);
        Editor.Metrics.trackTimeEnd(`programming:pack-build-start-${targetName}`);

        this._buildStarted = false;
        if (buildResult) {
            return buildResult;
        } else {
            console.warn('Cannot get build result from quick pack.');
            return { depsGraph: {} };
        }
    }

    public async clearCache(): Promise<void> {
        await this._quickPack.clear();
        this._firstBuild = true;
    }

    public async applyAssetChanges(changes: readonly AssetChange[]): Promise<void> {
        this._ensureIdle();
        for (const change of changes) {
            const uuid = change.uuid;
            // Note: "modified" directive is decomposed as "remove" and "add".
            if (change.type === AssetChangeType.modified ||
                change.type === AssetChangeType.remove) {
                const oldURL = this._uuidURLMap.get(uuid);
                if (!oldURL) {
                    // As of now, we receive an asset modifying or changing directive
                    // but the asset was not processed by us before.
                    // This however can only happen when:
                    // - the asset is removed, and it's an plugin script;
                    // - the asset is modified from plugin script to non-plugin-script.
                    // Otherwise, something went wrong.
                    // But we could not distinguish the second reason from
                    // "received an error asset change directive"
                    // since we don't know the asset's previous status. So we choose to skip this check.
                    // this._logger.warn(`Unexpected: ${uuid} is not in registry.`);
                } else {
                    this._uuidURLMap.delete(uuid);
                    this._modLo.unsetUUID(oldURL);
                    const deleted = this._prerequisiteAssetMods.delete(oldURL);
                    if (!deleted) {
                        this._logger.warn(`Unexpected: ${oldURL} is not in registry.`);
                    }
                }
            }
            if (change.type === AssetChangeType.modified ||
                change.type === AssetChangeType.add) {
                if (change.isPluginScript) {
                    continue;
                }
                const { href: url } = change.url;
                this._uuidURLMap.set(uuid, url);
                this._modLo.setUUID(url, uuid);
                this._prerequisiteAssetMods.add(url);
            }
        }

        // Update the import main module
        const prerequisiteImports = await this._getPrerequisiteAssetModsWithFilter();
        this._entryMod.source = (this._tentativePrerequisiteImportsMod ? makeTentativePrerequisiteImports : makePrerequisiteImportsMod)(prerequisiteImports);
    }

    public setEngineIndexModuleSource(source: string): void {
        this._ensureIdle();
        this._engineIndexMod.source = source;
    }

    public setAssetDatabaseDomains(assetDatabaseDomains: AssetDatabaseDomain[]): void {
        this._ensureIdle();

        const { _userImportMap: userImportMap } = this;

        const importMap: ImportMap = {
            // Integrates builtin mappings, since all of builtin mappings are absolute, we do not need parse.
            imports: { 'cc':  engineIndexModURL },
            scopes: {},
        };
        const importMapURL = userImportMap ? userImportMap.url : new URL('foo:/bar');

        const assetPrefixes: string[] = [];
        for (const assetDatabaseDomain of assetDatabaseDomains) {
            const assetDirURL = pathToFileURL(ps.join(assetDatabaseDomain.physical, ps.join(ps.sep))).href;
            importMap.imports![assetDatabaseDomain.root.href] = assetDirURL;
            assetPrefixes.push(assetDirURL);
        }

        if (userImportMap) {
            if (userImportMap.json.imports) {
                importMap.imports = {
                    ...importMap.imports,
                    ...userImportMap.json.imports,
                };
            }
            if (userImportMap.json.scopes) {
                for (const [scopeRep, specifierMap] of Object.entries(userImportMap.json.scopes)) {
                    const scopes = importMap.scopes ??= {};
                    scopes[scopeRep] = {
                        ...(scopes[scopeRep] ?? {}),
                        ...specifierMap,
                    };
                }
            }
        }

        this._logger.debug(
            `Our import map(${importMapURL}): ${JSON.stringify(importMap, undefined, 2)}`,
        );

        this._modLo.setImportMap(importMap, importMapURL);
        this._modLo.setAssetPrefixes(assetPrefixes);

        this._cleanResolutionNextTime = true;
    }

    private _buildStarted = false;
    private _ready = false;
    private _name: string;
    private _engineIndexMod: MemoryModule;
    private _entryMod: MemoryModule;
    private _modLo: ModLo;
    private _sourceMaps?: boolean | 'inline';
    private _quickPack: QuickPack;
    private _quickPackLoaderContext: QuickPackLoaderContext;
    private _prerequisiteAssetMods: Set<string> = new Set();
    private _uuidURLMap: Map<string, string> = new Map();
    private _logger: Logger;
    private _firstBuild = true;
    private _cleanResolutionNextTime = true;
    private _respectToFeatureSetting: boolean;
    private _tentativePrerequisiteImportsMod: boolean;
    private _userImportMap: ImportMapWithURL | undefined;
    private _callbacks: IPackerDriverCallbacks;

    private async _getPrerequisiteAssetModsWithFilter(): Promise<string[]> {
        let prerequisiteAssetMods = Array.from(this._prerequisiteAssetMods).sort();
        if (useEditorFolderFeature && this._name !== 'editor') {
            // preview 编译需要剔除 Editor 目录下的脚本
            const editorPatterns = await this._callbacks.onQueryEditorPatterns();
            prerequisiteAssetMods = Array.from(prerequisiteAssetMods).filter(mods => {
                const filePath = mods.startsWith('file:') ? fileURLToPath(mods) : mods;
                return !editorPatterns.some(pattern => matchPattern(filePath, pattern));
            });
        }
        return prerequisiteAssetMods;
    }

    private _ensureIdle(): void {
        asserts(!this._buildStarted, 'Build is in progress, but a status change request is filed');
    }
}