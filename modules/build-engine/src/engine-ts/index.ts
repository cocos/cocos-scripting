import type { BuildEngineOptions, BuildEngineResult } from '../index';
import { EngineBuilder } from './engine-builder';

export async function buildTsEngine (options: BuildEngineOptions): Promise<BuildEngineResult> {
    const builder = new EngineBuilder();
    await builder.build({
        root: options.engine,
        platform: options.platform,
        features: options.features,
        mode: options.mode,
        flagConfig: options.flags ?? {},
        outDir: options.out,
    });

    // NOTE: here we return a fixed result.
    return {
        exports: {},
        chunkAliases: { cc: './system-cc.js' },
        hasCriticalWarns: false,
        chunkDepGraph: {},
        assetDepGraph: {},
    };
}