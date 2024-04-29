// import * as Transformer from '@ccbuild/transformer';
// import * as Bundler from '@ccbuild/bundler';
import * as Modularize from '@ccbuild/modularize';
export { Modularize };

import * as dtsBundler from '@ccbuild/dts-bundler';
export { dtsBundler };

import type { buildEngine } from '@ccbuild/build-engine';
export type { buildEngine } from '@ccbuild/build-engine';

export type BuildEngineFunc = (options: buildEngine.Options)=> Promise<buildEngine.Result>

export async function loadBuildEngineModule(): Promise<{
    buildEngine: BuildEngineFunc,
}> {
    return await import('@ccbuild/build-engine');
}


export { StatsQuery, ConfigInterface } from '@ccbuild/stats-query';
// export { Transformer, Bundler };



export {
    ImportMap, Imports, ImportRestriction, SharedSettings, EngineInfo,
    AssetChange, AssetChangeType, AssetDatabaseDomain, UUID, FilePath,
 } from '@ccbuild/utils';

// quick build engine
import type { QuickCompiler } from '@ccbuild/quick-build-engine';
export type { 
    QuickCompiler, QuickCompileOptions, TargetOptions, Platform, SourceMapOptions, 
    ProgressMessage, TransformStageMessage, ExternalStageMessage, BundleStageMessage, Stage
} from '@ccbuild/quick-build-engine';

export async function loadQuickBuildEngineModule(): Promise<{
    QuickCompiler: typeof QuickCompiler;
}> {
    return await import('@ccbuild/quick-build-engine');
}

// build project
import { SharedSettings } from '@ccbuild/utils';
import type { buildProjRes, IBuildScriptFunctionOption } from '@ccbuild/build-project';

export type {
    buildProjRes, IBuildScriptFunctionOption, ModuleFormat, ModulePreservation,
    TransformOptions, Bundle, IAssetInfo, DBInfo, CCEnvConstants, ITransformTarget
} from '@ccbuild/build-project';

export type BuildScriptCommand = (options: IBuildScriptFunctionOption & SharedSettings) => Promise<buildProjRes>;

export async function loadBuildProjectModule(): Promise<{
    buildScriptCommand: BuildScriptCommand
}> {
    return await import('@ccbuild/build-project');
}

// quick build project
import type { PackerDriver } from '@ccbuild/quick-build-project';
export type { PackerDriver, PackerDriverOptions, IPackerDriverCallbacks, CCEModuleMap, TargetName, CCEModuleConfig } from '@ccbuild/quick-build-project';

export async function loadQuickBuildProjectModule(): Promise<{
    PackerDriver: typeof PackerDriver;
}> {
    return await import('@ccbuild/quick-build-project');
}

// export * from '@cocos/creator-programming-babel-preset-cc';
export type { Logger, LeveledLogMethod } from '@cocos/creator-programming-common';
// export * from '@cocos/creator-programming-import-maps';
// export * from '@cocos/creator-programming-mod-lo';


// quickpack loader
export type {
    QuickPackLoader, QuickPackLoaderContext, IQuickPackOptions, ChunkInfo,
    SerializedLoaderContext, ChunkId, ResolutionDetailMap, ChunkTimestamp, NotableResolutionDetail,
    ChunkMessage,
} from '@cocos/creator-programming-quick-pack';

import type { QuickPackLoader, QuickPackLoaderContext } from '@cocos/creator-programming-quick-pack';
export async function loadQuickPackModule(): Promise<{
    QuickPackLoader: typeof QuickPackLoader;
    QuickPackLoaderContext: typeof QuickPackLoaderContext;
}> {
    return await import('@cocos/creator-programming-quick-pack');
}

// export * from '@cocos/creator-programming-rollup-plugin-mod-lo';

// executor
export type { Executor, ImportEngineMod, PackModuleEvaluator, IPluginChangedInfo, PluginScriptInfo, BuiltinModuleProvider, PluginScriptId, BuiltinModuleOptions, TargetKind, IBuildTimeConstantValue } from '@editor/lib-programming';
import type { Executor } from '@editor/lib-programming';
export async function loadScriptExecutorModule(): Promise<{
    Executor: typeof Executor
}> {
    return await import('@editor/lib-programming');
}

// Module System

export type { BuildOptions as BuildSystemJsOptions, OutputOptions } from '@cocos/module-system';

import type { BuildOptions as BuildSystemJsOptions } from '@cocos/module-system';

export type BuildSystemJsFunc = (options: BuildSystemJsOptions) => Promise<void>;

export async function loadModuleSystem(): Promise<{
    build: BuildSystemJsFunc
}> {
    return await import('@cocos/module-system');
}

// Polyfills
export type { BuildPolyfillsOptions, CoreJSBuilderOptions } from '@editor/build-polyfills';
import type { BuildPolyfillsOptions } from '@editor/build-polyfills';
export type BuildPolyFillsFunc = (options: BuildPolyfillsOptions) => Promise<boolean>;

export async function loadBuildPolyfillModule(): Promise<{
    buildPolyfills: BuildPolyFillsFunc
}> {
    return await import('@editor/build-polyfills');
}
