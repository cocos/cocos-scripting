
import noderesolve from 'resolve';
import fs from 'fs-extra';
import ps from 'path';
import * as babel from '@babel/core';
// @ts-ignore
import babelPresetEnv from '@babel/preset-env';
// @ts-ignore
import babelPluginTransformCommonJS from 'babel-plugin-transform-commonjs';
import { makeVisitorOnModuleSpecifiers } from './module-interop';
import { moduleSpecifierURLRelative, pathToFileURL } from './path-url-interop';
import babelPluginKillAmd from './babel-plugin-kill-amd';

interface ImportMap {
    imports?: Record<string, string>;
    scopes?: Record<string, Record<string, string>>;
}

const VERSION = '1.0.1';

interface BuildResult {
    resolved: Array<string | null>;

    /**
     * Core NodeJS modules referenced.
     */
    nodeJsCoreModules?: Record<string, Array<{
        file?: string;
        requested: string;
    }>>;

    /**
     * Modules that cannot be resolved.
     */
    unresolved?: Array<{
        file?: string;
        requested: string;
        reason?: Error;
    }>;
}

enum ModuleResolveResultKind {
    resolved,
    nodeJsCore,
    unresolved,
    browserFieldEmpty,
}

type ModuleResolveResult = {
    kind: ModuleResolveResultKind.unresolved;

    /**
     * The reason why the specifier cannot be resolved.
     */
    reason?: Error;
} | {
    kind: ModuleResolveResultKind.resolved;
    /**
     * Resolved file or NodeJS core module name if `isNodeJsCoreModule === true`.
     */
    resolved: string;

    pkg?: string;
} | {
    kind: ModuleResolveResultKind.nodeJsCore;

    /**
     * Resolved file or NodeJS core module name if `isNodeJsCoreModule === true`.
     */
    resolved: string;
} | {
    kind: ModuleResolveResultKind.browserFieldEmpty;
};

type ModuleDependency = {
    kind: ModuleResolveResultKind.resolved;
    resolved: ModuleMeta;
} | {
    kind: ModuleResolveResultKind.nodeJsCore;
    resolved: string;
} | {
    kind: ModuleResolveResultKind.unresolved;
    reason?: Error;
};

interface InspectResult {
    failed?: boolean;
    dependencyResolveResults?: Record<string, ModuleResolveResult>;
}

interface ModuleMeta {
    file: string;
    failed?: boolean;
    dependencies?: Record<string, ModuleDependency>;
}

interface ModuleMetaCache {
    file: string;
    inspectTime: number;
    pkg?: PackageMeta;
    meta: ModuleMeta;
}

interface PackageMeta {
    inspectTime: number;
    path: string;
    browserField?: {
        files: Record<BringerNormalizedRelativePath, BringerNormalizedRelativePath | false>;
        modules: Record<BringerNormalizedRelativePath, BringerNormalizedRelativePath | false>;
    };
}

type BringerNormalizedRelativePath = string;

export class Bringer {
    constructor(options: Bringer.Options) {
        this._projectDir = options.project;
        this._outDir = options.outDir;
        this._incrementalFile = options.incrementalFile;
        this._externalModulePlaceHolder = options.excludedModulePlaceholder || Bringer.defaultExternalModulePlaceHolder;
        this._rootCache = (this._incrementalFile ? readCache(this._incrementalFile) : null) ?? {
            version: VERSION,
            modules: {},
            packages: {},
        };
    }

    public async build(modules: string[], options?: Bringer.BuildOptions): Promise<BuildResult> {
        options = options || {};
        const { importMapFile } = options;

        const buildResult: BuildResult = {
            resolved: new Array<string | null>(modules.length).fill(null),
        };
        buildResult.nodeJsCoreModules = {};
        buildResult.unresolved = [];
        const addNodeJsCoreModuleReference = (resolved: string, requested: string, file?: string) => {
            if (!buildResult.nodeJsCoreModules) {
                buildResult.nodeJsCoreModules = {};
            }
            if (!(resolved in buildResult.nodeJsCoreModules)) {
                buildResult.nodeJsCoreModules[resolved] = [];
            }
            buildResult.nodeJsCoreModules[resolved].push({
                requested,
                file,
            });
        };

        const topLevelModuleMetas = new Array<ModuleMeta | null>(modules.length).fill(null);

        for (let iModule = 0; iModule < modules.length; ++iModule) {
            const moduleId = modules[iModule];
            const resolveResult = await this._resolveModule(moduleId, this._projectDir);
            if (resolveResult.kind === ModuleResolveResultKind.nodeJsCore) {
                buildResult.resolved[iModule] = resolveResult.resolved;
                addNodeJsCoreModuleReference(
                    resolveResult.resolved,
                    moduleId,
                );
            } else if (resolveResult.kind === ModuleResolveResultKind.resolved) {
                const moduleMeta = await this._inspectRecursive(resolveResult.resolved, resolveResult.pkg);
                topLevelModuleMetas[iModule] = moduleMeta;
                buildResult.resolved[iModule] = resolveResult.resolved;
            } else if (resolveResult.kind === ModuleResolveResultKind.unresolved) {
                buildResult.unresolved.push({
                    requested: moduleId,
                    reason: resolveResult.reason,
                });
            }
        }

        const visited = new Set<ModuleMeta>();
        const visit = (moduleMeta: ModuleMeta) => {
            visited.add(moduleMeta);
            if (moduleMeta.dependencies) {
                for (const requestedModule of Object.keys(moduleMeta.dependencies)) {
                    const dependency = moduleMeta.dependencies[requestedModule];
                    if (dependency.kind === ModuleResolveResultKind.unresolved) {
                        buildResult.unresolved!.push({
                            reason: dependency.reason,
                            requested: requestedModule,
                            file: moduleMeta.file,
                        });
                    } else if (dependency.kind === ModuleResolveResultKind.nodeJsCore) {
                        addNodeJsCoreModuleReference(
                            dependency.resolved,
                            requestedModule,
                            moduleMeta.file
                        );
                    } else {
                        if (!visited.has(dependency.resolved)) {
                            visit(dependency.resolved);
                        }
                    }
                }
            }
        };
        for (const topLevelModuleMeta of topLevelModuleMetas) {
            if (topLevelModuleMeta) {
                visit(topLevelModuleMeta);
            }
        }

        const mapping = new Array<string | null>(modules.length).fill(null);
        if (importMapFile) {
            const importMapFileURL = pathToFileURL(importMapFile);
            const importMap: ImportMap = {};
            for (let iModule = 0; iModule < modules.length; ++iModule) {
                const moduleId = modules[iModule];
                const topLevelModuleMeta = topLevelModuleMetas[iModule];
                if (topLevelModuleMeta) {
                    const outFile = this._getOutFile(topLevelModuleMeta.file);
                    const outFileURL = pathToFileURL(outFile);
                    mapping[iModule] = outFileURL;
                    const relativeURL = moduleSpecifierURLRelative(importMapFileURL, outFileURL);
                    (importMap.imports ?? (importMap.imports = {}))[moduleId] = relativeURL;
                }
            }
            await fs.ensureDir(ps.dirname(importMapFile));
            await fs.writeFile(importMapFile, JSON.stringify(importMap, undefined, 4));
        }
        
        return buildResult;
    }
    
    private async _inspectRecursive(file: string, pkg: string | undefined) {
        const fileStat = await fs.stat(file);
        const fileTime = fileStat.mtimeMs;
        const cacheKey = this._getCacheKey(file);
        const outFile = this._getOutFile(file);
        if (cacheKey in this._rootCache.modules) {
            const moduleMetaCache = this._rootCache.modules[cacheKey];
            if (moduleMetaCache.inspectTime === fileTime &&
                await fs.pathExists(outFile)) {
                return moduleMetaCache.meta;
            }
        }

        console.debug(`Inspecting ${file}...`);
        const moduleMetaCache: ModuleMetaCache = {
            file,
            inspectTime: fileTime,
            meta: {
                file,
                failed: true,
            },
        };
        this._rootCache.modules[cacheKey] = moduleMetaCache;

        const inspectResult = await this._inspect(
            file,
            outFile,
            pkg ? this._rootCache.packages[pkg] : undefined,
        );

        if (!inspectResult.failed) {
            delete moduleMetaCache.meta.failed;
        }
        if (inspectResult.dependencyResolveResults) {
            moduleMetaCache.meta.dependencies = {};
            for (const requestedModule of Object.keys(inspectResult.dependencyResolveResults)) {
                const dependencyResolveResult = inspectResult.dependencyResolveResults[requestedModule];
                if (dependencyResolveResult.kind === ModuleResolveResultKind.unresolved ||
                    dependencyResolveResult.kind === ModuleResolveResultKind.nodeJsCore) {
                    moduleMetaCache.meta.dependencies[requestedModule] = dependencyResolveResult;
                } else if (dependencyResolveResult.kind === ModuleResolveResultKind.resolved) {
                    const moduleMeta = await this._inspectRecursive(dependencyResolveResult.resolved, dependencyResolveResult.pkg);
                    moduleMetaCache.meta.dependencies[requestedModule] = {
                        kind: ModuleResolveResultKind.resolved,
                        resolved: moduleMeta,
                    };
                }
            }
        }

        return moduleMetaCache.meta;
    }

    private async _inspect(file: string, outFile: string, pkg: PackageMeta | undefined): Promise<InspectResult> {
        const sourceCode = (await fs.readFile(file)).toString();
        
        const passToESM = await babel.transformAsync(sourceCode, {
            ast: true,
            sourceMaps: true,
            plugins: [
                babelPluginTransformCommonJS
            ],
        });
        if (!passToESM) {
            return {};
        }

        const requestedModules: string[] = [];
        babel.traverse(passToESM.ast!, makeVisitorOnModuleSpecifiers((path) => {
            requestedModules.push(path.node.value);
        }));

        const dependencyResolveResults: Record<string, ModuleResolveResult> = {};
        if (requestedModules) {
            const fileDir = ps.dirname(file);
            for (const requestedModule of requestedModules) {
                dependencyResolveResults[requestedModule] = await this._resolveModule(requestedModule, fileDir, pkg);
            }
        }
        const applyResolveResult: babel.PluginObj = {
            visitor: makeVisitorOnModuleSpecifiers((path) => {
                const requestedModule = path.node.value;
                if (requestedModule in dependencyResolveResults) {
                    const resolveResult = dependencyResolveResults[requestedModule];
                    if (resolveResult.kind === ModuleResolveResultKind.resolved) {
                        const relative = moduleSpecifierURLRelative(
                            pathToFileURL(file),
                            pathToFileURL(resolveResult.resolved));
                        path.replaceWith(babel.types.stringLiteral(relative));
                    } else if (resolveResult.kind === ModuleResolveResultKind.browserFieldEmpty) {
                        path.replaceWith(babel.types.stringLiteral(this._externalModulePlaceHolder));
                    }
                }
            }),
        };

        const passToDest = await babel.transformFromAstAsync(passToESM.ast!, undefined, {
            sourceMaps: 'inline',
            inputSourceMap: passToESM.map,
            plugins: [
                applyResolveResult,
            ],
            presets: [
                [{
                    plugins: [ babelPluginKillAmd ],
                }],
                [babelPresetEnv, { modules: 'systemjs' }]
            ],
        });
        if (!passToDest) {
            return {};
        }

        await fs.ensureDir(ps.dirname(outFile));
        await fs.writeFile(outFile, passToDest.code);

        return {
            dependencyResolveResults,
        };
    }

    private async _resolveModule(id: string, baseDir: string, baseDirPackageMeta?: PackageMeta): Promise<ModuleResolveResult> {
        if (baseDirPackageMeta && baseDirPackageMeta.browserField) {
            if (id in baseDirPackageMeta.browserField.modules) {
                const subsititution = baseDirPackageMeta.browserField.modules[id];
                if (subsititution === false) {
                    return {
                        kind: ModuleResolveResultKind.browserFieldEmpty,
                    };
                } else {
                    return {
                        kind: ModuleResolveResultKind.resolved,
                        resolved: subsititution,
                    };
                }
            }
        }

        try {
            return await new Promise<ModuleResolveResult>((resolve, reject) => {
                const pkgPropertyKeyPackageMetaKey = '__bringer_package_meta_key__';
                const relativePathBrowserFieldEmpty = '__browser_field_empty__';
                noderesolve(id, {
                    basedir: baseDir,
                    packageFilter: (pkg, packagePath) => {
                        const packageMetaKey = this._updatePackageMeta(pkg, packagePath);
                        pkg[pkgPropertyKeyPackageMetaKey] = packageMetaKey;
                        return pkg;
                    },
                }, (error, resolved, pkg) => {
                    if (error) {
                        reject(error);
                    } else {
                        function assetsResolved(resolved: string | undefined): asserts resolved is string {}
                        assetsResolved(resolved);

                        if (noderesolve.isCore(resolved)) {
                            resolve({
                                kind: ModuleResolveResultKind.nodeJsCore,
                                resolved: resolved!,
                            });
                        } else if (resolved!.endsWith(relativePathBrowserFieldEmpty)) {
                            return {
                                kind: ModuleResolveResultKind.browserFieldEmpty,
                            };
                        } else {
                            let resolveResultKind: ModuleResolveResultKind = ModuleResolveResultKind.resolved;
                            let packageMetaKey: string | undefined;
                            if (pkg && (pkgPropertyKeyPackageMetaKey in pkg)) {
                                packageMetaKey = pkg[pkgPropertyKeyPackageMetaKey];
                                const packageMeta = this._getPackageMeta(packageMetaKey!);
                                if (packageMeta.browserField) {
                                    const relative = ps.relative(packageMeta.path, resolved);
                                    const normalizedRelative = normalizeRelativePath(relative);
                                    if (normalizedRelative in packageMeta.browserField.files) {
                                        const subsititution = packageMeta.browserField.files[normalizedRelative];
                                        if (subsititution === false) {
                                            resolveResultKind = ModuleResolveResultKind.browserFieldEmpty;
                                        } else {
                                            resolved = ps.resolve(packageMeta.path, subsititution);
                                        }
                                    }
                                }
                            }
                            resolve(resolveResultKind === ModuleResolveResultKind.browserFieldEmpty ? {
                                kind: ModuleResolveResultKind.browserFieldEmpty,
                            } : {
                                kind: ModuleResolveResultKind.resolved,
                                resolved: resolved,
                                pkg: packageMetaKey,
                            });
                        }
                    }
                });
            });
        } catch (error) {
            return {
                kind: ModuleResolveResultKind.unresolved,
                reason: error,
            };
        }
    }

    private _getCacheKey(file: string): string {
        let pathRelative = ps.relative(this._projectDir, file);
        return pathRelative.replace(/\\/g, '/');
    }

    private _getOutFile(file: string) {
        // !!!TODO handle out-of-project reference.
        const outFile = ps.join(this._outDir, ps.relative(this._projectDir, file));
        return outFile;
    }

    private _updatePackageMeta(pkg: any, packagePath: string) {
        const packageMetaKey = this._getPackageMetaKey(packagePath);
        const packageFileStat = fs.statSync(packagePath);
        const fileTime = packageFileStat.mtimeMs;
        if (packageMetaKey in this._rootCache.packages) {
            const packageMeta = this._rootCache.packages[packageMetaKey];
            if (packageMeta.inspectTime === fileTime) {
                return packageMetaKey;
            }
        }
        const packageMeta: PackageMeta = {
            inspectTime: fileTime,
            path: ps.dirname(packagePath),
        };

        const browserField = pkg['browser'];
        if (browserField === false || typeof browserField === 'string') {
            packageMeta.browserField = {
                modules: {},
                files: {
                    [normalizeRelativePath(pkg.main ?? 'index.js')]: normalizeRelativePath(browserField),
                },
            };
        } else if (typeof browserField === 'object') {
            packageMeta.browserField = {
                modules: {},
                files: {},
            };
            for (const fileOrModuleId of Object.keys(browserField)) {
                const subsititution = browserField[fileOrModuleId] === false ?
                    false : normalizeRelativePath(browserField[fileOrModuleId]);
                if (fileOrModuleId.startsWith('.') ||
                    ps.extname(fileOrModuleId).length !== 0) {
                    // File id
                    packageMeta.browserField.files[normalizeRelativePath(fileOrModuleId)] = subsititution;
                } else {
                    // Module id
                    packageMeta.browserField.modules[fileOrModuleId] = subsititution;
                }
            }
        }

        this._rootCache.packages[packageMetaKey] = packageMeta;
        return packageMetaKey;
    }

    private _getPackageMeta(key: string) {
        return this._rootCache.packages[key];
    }

    private _getPackageMetaKey(packagePath: string) {
        return packagePath;
    }

    private _projectDir: string;
    private _outDir: string;
    private _incrementalFile?: string;
    private _rootCache: RootCache;
    private _externalModulePlaceHolder: string;
}

export namespace Bringer {
    export interface Options {
        project: string;

        outDir: string;

        incrementalFile?: string;

        excludedModulePlaceholder?: string;
    }

    export interface BuildOptions {
        importMapFile?: string;
    }

    export const defaultExternalModulePlaceHolder = '__BRINGER_EXCLUDED__';
}

interface RootCache {
    version: string;
    modules: Record<string, ModuleMetaCache>;
    packages: Record<string, PackageMeta>;
}

function readCache(cacheFile: string): RootCache | null {
    try {
        const cache = fs.readJSONSync(cacheFile) as RootCache;
        if (cache.version === VERSION) {
            return cache;
        }
    } catch {

    }
    return null;
}

function normalizeRelativePath(relativePath: string) {
    return ps.normalize(relativePath).replace(/[\\]/g, '/');
}
