// import * as Transformer from '@ccbuild/transformer';
// import * as Bundler from '@ccbuild/bundler';
import * as Modularize from '@ccbuild/modularize';
export { Modularize };

import * as dtsBundler from '@ccbuild/dts-bundler';
export { dtsBundler };

import type { buildEngine, enumerateAllDependents, enumerateDependentAssets, enumerateDependentChunks, isSourceChanged, transform } from '@ccbuild/build-engine';
export type { BuildEngineOptions, BuildEngineResult } from '@ccbuild/build-engine';

export interface BuildEngineModule {
    buildEngine: typeof buildEngine;
    enumerateAllDependents: typeof enumerateAllDependents;
    enumerateDependentAssets: typeof enumerateDependentAssets;
    enumerateDependentChunks: typeof enumerateDependentChunks;
    isSourceChanged: typeof isSourceChanged;
    transform: typeof transform;
}

export async function loadBuildEngineModule(): Promise<BuildEngineModule> {
    return await import('@ccbuild/build-engine');
}


export { StatsQuery, ConfigInterface } from '@ccbuild/stats-query';
// export { Transformer, Bundler };


export {
    ImportMap, Imports, ImportRestriction, SharedSettings, EngineInfo,
    AssetChange, AssetChangeType, AssetDatabaseDomain, UUID, FilePath, editorBrowserslistQuery,
 } from '@ccbuild/utils';

// quick build engine
import type { QuickCompiler } from '@ccbuild/quick-build-engine';
export type { 
    QuickCompiler, QuickCompileOptions, TargetOptions, Platform, SourceMapOptions, 
    ProgressMessage, TransformStageMessage, ExternalStageMessage, BundleStageMessage, Stage
} from '@ccbuild/quick-build-engine';

export interface QuickBuildEngineModule {
    QuickCompiler: typeof QuickCompiler;
}

export async function loadQuickBuildEngineModule(): Promise<QuickBuildEngineModule> {
    return await import('@ccbuild/quick-build-engine');
}

// build project
import { SharedSettings } from '@ccbuild/utils';
import type { buildProjRes, IBuildScriptFunctionOption, buildScriptCommand } from '@ccbuild/build-project';

export type {
    buildProjRes, IBuildScriptFunctionOption, ModuleFormat, ModulePreservation,
    TransformOptions, Bundle, IAssetInfo, DBInfo, CCEnvConstants, ITransformTarget
} from '@ccbuild/build-project';

export type BuildScriptCommand = (options: IBuildScriptFunctionOption & SharedSettings) => Promise<buildProjRes>;

export interface BuildProjectModule {
    buildScriptCommand: BuildScriptCommand;
}

export async function loadBuildProjectModule(): Promise<BuildProjectModule> {
    return await import('@ccbuild/build-project');
}

// quick build project
import type { PackerDriver } from '@ccbuild/quick-build-project';
export type { PackerDriver, PackerDriverOptions, IPackerDriverCallbacks, CCEModuleMap, TargetName, CCEModuleConfig } from '@ccbuild/quick-build-project';

export interface QuickBuildProjectModule {
    PackerDriver: typeof PackerDriver;
}

export async function loadQuickBuildProjectModule(): Promise<QuickBuildProjectModule> {
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

export interface QuickPackModule {
    QuickPackLoader: typeof QuickPackLoader;
    QuickPackLoaderContext: typeof QuickPackLoaderContext;
}

export async function loadQuickPackModule(): Promise<QuickPackModule> {
    return await import('@cocos/creator-programming-quick-pack');
}

// export * from '@cocos/creator-programming-rollup-plugin-mod-lo';

// executor
export type { Executor, ImportEngineMod, PackModuleEvaluator, IPluginChangedInfo, PluginScriptInfo, BuiltinModuleProvider, PluginScriptId, BuiltinModuleOptions, TargetKind, IBuildTimeConstantValue } from '@editor/lib-programming';
import type { Executor, BuiltinModuleProvider } from '@editor/lib-programming';

export interface ScriptExecutorModule {
    Executor: typeof Executor;
    BuiltinModuleProvider: typeof BuiltinModuleProvider;
}

export async function loadScriptExecutorModule(): Promise<ScriptExecutorModule> {
    return await import('@editor/lib-programming');
}

// Module System

export type { BuildOptions as BuildSystemJsOptions, OutputOptions } from '@cocos/module-system';

import type { BuildOptions as BuildSystemJsOptions } from '@cocos/module-system';

export type BuildSystemJsFunc = (options: BuildSystemJsOptions) => Promise<void>;

export interface ModuleSystem {
    build: BuildSystemJsFunc;
}

export async function loadModuleSystem(): Promise<ModuleSystem> {
    return await import('@cocos/module-system');
}

// Polyfills
export type { BuildPolyfillsOptions, CoreJSBuilderOptions } from '@editor/build-polyfills';
import type { BuildPolyfillsOptions } from '@editor/build-polyfills';
export type BuildPolyFillsFunc = (options: BuildPolyfillsOptions) => Promise<boolean>;

export interface BuildPolyFillsModule {
    buildPolyfills: BuildPolyFillsFunc;
}

export async function loadBuildPolyfillsModule(): Promise<BuildPolyFillsModule> {
    return await import('@editor/build-polyfills');
}
