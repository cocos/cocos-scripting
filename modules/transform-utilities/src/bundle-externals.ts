import { OutputOptions, Plugin, rollup, RollupOptions } from 'rollup';
// @ts-ignore
import rpBabel from 'rollup-plugin-babel';
// @ts-ignore
import rpSourcemaps from 'rollup-plugin-sourcemaps';
import { terser } from 'rollup-plugin-terser';
import rpCommonJS from 'rollup-plugin-commonjs';
import rpNodeResolve from 'rollup-plugin-node-resolve';
// @ts-ignore
import babelPresetEnv from '@babel/preset-env';
import UUID from 'node-uuid';

export interface ImportMap {
    imports?: Record<string, string>;
    scopes?: Record<string, Record<string, string>>;
}

export interface BundleExternalsOptions {
    minify?: boolean;
    sourceMap?: boolean;
}

export interface BundleResult {
    /**
     * Key is the entry, value is the relative url from chunkDir.
     */
    entryMap: Record<string, string>;

    watchFiles: string[];
}

export async function bundleExternals(chunkDir: string, entries: string[], options?: BundleExternalsOptions): Promise<BundleResult> {
    options = options || {};
    const withSourceMap = options.sourceMap;
    const doMinify = options.minify;
    const result: BundleResult = {
        entryMap: {},
        watchFiles: [],
    };

    const rollupPlugins: Plugin[] = [
        rpNodeResolve(),
        rpCommonJS(),
        rpBabel({
            presets: [
                babelPresetEnv,
            ],
        }),
    ];
    if (withSourceMap) {
        rollupPlugins.push(rpSourcemaps);
    }
    if (doMinify) {
        rollupPlugins.push(terser);
    }

    const rollupInput: Record<string, string> = {};
    for (const entry of entries) {
        const entryChunkUUID = UUID.v4();
        result.entryMap[entry] = `${entryChunkUUID}.js`;
        rollupInput[entryChunkUUID] = entry;
    }

    const rollupOptions: RollupOptions = {
        input: rollupInput,
        plugins: rollupPlugins,
    };

    const rollupBuild = await rollup(rollupOptions);
    result.watchFiles = rollupBuild.watchFiles.slice();

    const rollupOutputOptions: OutputOptions = {
        format: 'amd',
        sourcemap: withSourceMap,
        dir: chunkDir,
        // name: 'externalBundle',
    };
    
    await rollupBuild.write(rollupOutputOptions);
    return result;
}