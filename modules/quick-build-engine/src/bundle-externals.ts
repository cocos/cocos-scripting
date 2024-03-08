import { OutputOptions, Plugin, rollup, RollupOptions, WarningHandlerWithDefault } from 'rollup';
import rpBabel, { RollupBabelInputPluginOptions } from '@rollup/plugin-babel';
// @ts-ignore
import rpSourcemaps from 'rollup-plugin-sourcemaps';
import { terser } from 'rollup-plugin-terser';
import rpCommonJS from '@rollup/plugin-commonjs';
import rpNodeResolve from '@rollup/plugin-node-resolve';
// @ts-ignore
import babelPresetEnv from '@babel/preset-env';
import UUID from 'node-uuid';
import { encodeUrlAsFilePath } from './utilts';
import fs from 'fs';

export interface ImportMap {
    imports?: Record<string, string>;
    scopes?: Record<string, Record<string, string>>;
}

export interface BundleExternalsOptions {
    perf?: boolean;

    rootDir: string;
}

export interface BundleResult {
    /**
     * Key is the entry, value is the relative url from chunkDir.
     */
    entryMap: Record<string, string>;

    watchFiles: string[];
}

export async function bundleExternals(entries: [string, string][], options: BundleExternalsOptions) {
    // const withSourceMap = options.sourceMap;
    // const doMinify = options.minify;

    const realpath = typeof fs.realpath.native === 'function' ? fs.realpath.native : fs.realpath;
    const realPath = (file: string) => new Promise<string>((resolve, reject) => {
        realpath(file, function (err, path) {
            if (err && err.code !== 'ENOENT') {
                reject(err);
            } else {
                resolve(err ? file : path);
            }
        });
    });

    const rollupWarningHandler: WarningHandlerWithDefault = (warning, defaultHandler) => {
        if (typeof warning !== 'string') {
            if (warning.code === 'THIS_IS_UNDEFINED') {
                // TODO: It's really inappropriate to do this...
                // Let's fix these files instead of suppressing rollup.
                if (warning.id?.match(/(?:spine-core\.js$)|(?:dragonBones\.js$)/)) {
                    console.debug(`Rollup warning 'THIS_IS_UNDEFINED' is omitted for ${warning.id}`);
                    return;
                }
            }
        }

        defaultHandler(warning);
    };

    const rollupPlugins: Plugin[] = [
        rpNodeResolve({
            jail: await realPath(options.rootDir),
            rootDir: options.rootDir,
        }),
        rpCommonJS({
            include: [
                /node_modules[/\\]/,
                /asm\.js/,
            ],
            sourceMap: false, // Save performance
        }),
        rpBabel({
            babelHelpers: 'bundled',
            overrides: [{
                // Eliminates the babel compact warning:
                // 'The code generator has deoptimised the styling of ...'
                // that came from node_modules/@cocos
                test: /node_modules[/\\]@cocos[/\\]/,
                compact: true,
            }],
            exclude: [
                /node_modules[/\\]@cocos[/\\]ammo/,
                /node_modules[/\\]@cocos[/\\]cannon/,
                /node_modules[/\\]@cocos[/\\]physx/,
                /asm\.js/,
            ],
            presets: [
                babelPresetEnv,
            ],
        } as RollupBabelInputPluginOptions),
        // rpSourcemaps,
    ];
    // if (doMinify) {
    //     rollupPlugins.push(terser);
    // }

    const entryMap: Record<string, string> = {};
    const rollupInput: Record<string, string> = {};
    for (const [entry, nameHint] of entries) {
        const entryChunkUUID = nameHint.split(/[\\/]/g).map((part) => encodeUrlAsFilePath(part)).join('/');
        entryMap[entry] = `${entryChunkUUID}.js`;
        rollupInput[entryChunkUUID] = entry;
    }

    const rollupOptions: RollupOptions = {
        input: rollupInput,
        plugins: rollupPlugins,
        perf: options.perf,
        onwarn: rollupWarningHandler,
    };

    const rollupBuild = await rollup(rollupOptions);
    if (rollupBuild.getTimings) {
        console.debug(rollupBuild.getTimings());
    }
    const watchFiles = rollupBuild.watchFiles.slice();

    return {
        entryMap,
        watchFiles,
        write: async (writeOptions: {
            minify?: boolean;
            sourceMap?: boolean;
            format: 'commonjs' | 'systemjs';
            chunkDir: string;
        }) => {
            const rollupOutputOptions: OutputOptions = {
                format: writeOptions.format === 'systemjs' ? 'system' : (writeOptions.format),
                sourcemap: writeOptions.sourceMap,
                dir: writeOptions.chunkDir,
                exports: 'auto',
            };

            await rollupBuild.write(rollupOutputOptions);
        },
    };
}
