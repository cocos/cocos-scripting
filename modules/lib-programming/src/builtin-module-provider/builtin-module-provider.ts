import fs from 'fs-extra';
import ps from 'path';
import { IBuildTimeConstantValue, makeBuildTimeConstantModule } from './build-time-constants';
import * as babel from '@babel/core';
// import babelPresetCC from '@cocos/babel-preset-cc';
// @ts-ignore
// import babelPresetEnv from '@babel/preset-env';
import babelPluginTransformModulesSystemJs from '@babel/plugin-transform-modules-systemjs';
import URL from 'url';

interface BuiltinModuleOptions {
    /**
     * `BuiltinModuleProvider` 中提供的模块的格式。
     */
    format?: 'systemjs' | 'esm';
}

/**
 * 很多时候 `BuiltinModuleProvider` 中的模块需要映射到其它模块。
 * `TargetKind` 代表了目标模块的模块格式。
 */
type TargetKind = 'commonjs' | 'amd';

/**
 * `BuiltinModuleProvider` 用于提供项目脚本用到的所有“内置”模块，例如：
 * - `"cc.base"` 等引擎模块
 * - 模块 `"cc/env"` —— 提供了构建时常量
 * 
 * 它提供的内置模块可以用于在**编辑器环境**中、**预览环境**中以及**构建时打包工具**的环境中运行。
 */
export class BuiltinModuleProvider {
    public static async create(options: BuiltinModuleOptions): Promise<BuiltinModuleProvider> {
        const provider = new BuiltinModuleProvider(options);
        await provider._initialize(options);
        return provider;
    }

    /**
     * 添加 `'cc'` 模块。
     * @param mods `'cc'` 模块导出的所有子模块。
     */
    public async addEngineIndexMod(mods: string[]): Promise<void>;

    public async addEngineIndexMod(url: string, xSourceKind?: TargetKind): Promise<void>;

    public async addEngineIndexMod(url: string[] | string, xSourceKind?: TargetKind) {
        if (Array.isArray(url)) {
            this._modules['cc'] = await this._transform(makeModuleCCSource(url));
        } else {
            this._modules['cc'] = await this._makeModuleAlias(url, xSourceKind);
        }
    }

    public async addEngineMods(ccMods: Record<string, string>, xSourceKind?: TargetKind) {
        await Promise.all(Object.entries(ccMods).map(async ([id, alias]) => {
            this._modules[id] = await this._makeModuleAlias(alias, xSourceKind);
        }));
    }

    /**
     * 添加 `'cc/env'` 模块。
     * @param constants `'cc/env'` 模块中的常量以及它们的值。
     */
    public async addBuildTimeConstantsMod(constants: Record<string, IBuildTimeConstantValue>): Promise<void>;

    /**
     * 添加 `'cc/env'` 模块。让 `'cc/env'` 映射为指定的模块.
     * @param url 指定的模块。若未指定则为 `this.getBTCMappingSource()`。
     * @param xSourceKind 指定模块的格式。
     */
    public async addBuildTimeConstantsMod(url?: string, xSourceKind?: TargetKind): Promise<void>;

    public async addBuildTimeConstantsMod(constants: string | undefined | Record<string, IBuildTimeConstantValue>, xSourceKind?: TargetKind) {
        if (typeof constants === 'object') {
            this._modules[ModuleNames.buildTimeConstants] =
                await this._transform(await makeBuildTimeConstantModule(constants));
        } else {
            this._modules[ModuleNames.buildTimeConstants] =
                await this._makeModuleAlias(constants ?? this.getBTCMappingSource(), xSourceKind);
        }
        // Deprecated: use 'cc/env'
        this._modules['cce.env'] = this._modules[ModuleNames.buildTimeConstants];
    }

    public getBTCMappingSource() {
        return `cc/editor/populate-internal-constants`;
    }

    /**
     * 当前提供的所有模块以及它们的源码。
     */
    get modules(): Readonly<Record<string, string>> {
        return this._modules;
    }

    private _modules: Record<string, string> = {};
    private _format: NonNullable<BuiltinModuleOptions['format']>;

    private constructor(options: BuiltinModuleOptions) {
        this._format = options.format ?? 'esm';
    }

    private async _initialize(options: BuiltinModuleOptions) {
    }

    private async _makeModuleAlias(alias: string, targetKind: TargetKind | undefined) {
        if (targetKind === 'commonjs') {
            let moduleName: string;
            try {
                moduleName = URL.fileURLToPath(alias);
            } catch {
                moduleName = alias;
            }
            return `\
System.register([], (_export) => {
    return {
        execute: () => { _export(require('${moduleName.replace(/\\/g, '\\\\')}')); },
    };
});
`;
        } else if (targetKind === 'amd') {
            return `\
System.register(['${alias}'], (_export) => {
    let m;
    return {
        setters: [(mAmd) => { m = mAmd.default; }],
        execute: () => { _export(m); },
    };
});
`;
        } else {
            return await this._transform(`export * from '${alias}';`);
        }
    }

    private async _transform(code: string) {
        if (this._format === 'esm') {
            return code;
        }
        const babelFileResult = await babel.transformAsync(code, {
            plugins: [[babelPluginTransformModulesSystemJs]],
            presets: [
                // [babelPresetEnv, {
                //     modules: 'systemjs',
                // }],
                // [babelPresetCC, {
                //     useDefineForClassFields: true,
                //     allowDeclareFields: true,
                // }],
            ],
        });
        if (!babelFileResult) {
            throw new Error(`Failed to transform code in PreviewFacet: ${code}`);
        }
        return babelFileResult.code!;
    }
}

function makeModuleCCSource(dependencies: string[]) {
    const source = dependencies.map((dependency) => `export * from '${dependency}';`).join('\n');
    return source;
}

enum ModuleNames {
    codeQualityCr = 'cce:code-quality/cr',
    buildTimeConstants = 'cc/env',
}
