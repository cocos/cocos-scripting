import * as Transformer from '@ccbuild/transformer';
import * as Bundler from '@ccbuild/bundler';
import * as Modularize from '@ccbuild/modularize';
import * as dtsBundler from '@ccbuild/dts-bundler';

export { buildEngine } from '@ccbuild/build-engine';
export { StatsQuery, ConfigInterface } from '@ccbuild/stats-query';
export { Transformer, Bundler };
export { Modularize };
export { dtsBundler };
export * from '@ccbuild/utils';

import type { QuickCompiler } from '@ccbuild/quick-build-engine';
export type { QuickCompiler, QuickCompileOptions } from '@ccbuild/quick-build-engine';
export async function loadQuickBuildEngineModule(): Promise<{
    QuickCompiler: typeof QuickCompiler;
}> {
    return await import('@ccbuild/quick-build-engine');
}

export * from '@ccbuild/build-project';

import type { PackerDriver } from '@ccbuild/quick-build-project';
export type { PackerDriver, PackerDriverOptions, IPackerDriverCallbacks, CCEModuleMap } from '@ccbuild/quick-build-project';

export async function loadQuickBuildProjectModule(): Promise<{
    PackerDriver: typeof PackerDriver;
}> {
    return await import('@ccbuild/quick-build-project');
}

// export * from '@cocos/creator-programming-babel-preset-cc';
export type { Logger } from '@cocos/creator-programming-common';
// export * from '@cocos/creator-programming-import-maps';
// export * from '@cocos/creator-programming-mod-lo';
export type { QuickPackLoader, QuickPackLoaderContext } from '@cocos/creator-programming-quick-pack';

import type { QuickPackLoader, QuickPackLoaderContext } from '@cocos/creator-programming-quick-pack';
export async function loadQuickPackModule(): Promise<{
    QuickPackLoader: typeof QuickPackLoader;
    QuickPackLoaderContext: typeof QuickPackLoaderContext;
}> {
    return await import('@cocos/creator-programming-quick-pack');
}

// export * from '@cocos/creator-programming-rollup-plugin-mod-lo';
export { Executor, PluginScriptInfo, BuiltinModuleProvider } from '@editor/lib-programming';

export { build as buildSystemJs, BuildOptions as BuildSystemJsOptions } from '@cocos/module-system';
export * from '@editor/build-polyfills';


