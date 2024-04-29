/// <reference types="../@types/core-js-builder" />
// @ts-ignore
import rpBabel from '@rollup/plugin-babel';
// @ts-ignore
import rpMultiEntry from '@rollup/plugin-multi-entry';
// @ts-ignore
import rpSourcemaps from 'rollup-plugin-sourcemaps';
import rpCommonjs from '@rollup/plugin-commonjs';
import rpNodeResolve from '@rollup/plugin-node-resolve';
import { terser } from 'rollup-plugin-terser';
import { OutputOptions, Plugin, rollup, RollupOptions } from 'rollup';
import tmp from 'tmp';

import coreJsBuilder from 'core-js-builder';
// @ts-ignore
import ps from 'path';


/**
 * @param options 
 * @returns True if the requested polyfills(bundle) is generated and should be taken.
 * False if no polyfill is necessary, the bundle file is not generated as well.
 */
export async function buildPolyfills(options: BuildPolyfillsOptions): Promise<boolean> {
    const entries: string[] = [];

    // core-js polyfills
    if (options.coreJs === true || typeof options.coreJs === 'object') {
        const coreJsTempDir = await new Promise<string>((resolve, reject) => {
            tmp.dir({}, (error, name) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(name);
                }
            });
        });
        const coreJsOutFile = ps.join(coreJsTempDir, 'core-js.js');
        const coreJsOptions: coreJsBuilder.Options = Object.assign({},
            options.coreJs === true ? defaultCoreJsOptions : options.coreJs,
            { filename: coreJsOutFile },
        );
        try {
            await coreJsBuilder(coreJsOptions);
            entries.push(coreJsOutFile);
        } catch (err) {
            console.debug(
                `Caught exception during build core-js: ${err}\n` +
                `This may indicates the core-js polyfill is not necessary. ` +
                `See https://github.com/zloirock/core-js/issues/822`
            );
        }
    }

    if (options.asyncFunctions) {
        entries.push(require.resolve(require.resolve('regenerator-runtime/runtime')));
    }

    // Fetch polyfills
    if (options.fetch) {
        entries.push(require.resolve('whatwg-fetch'));
    }

    if (entries.length === 0) {
        return false;
    }

    await bundle(entries, options.file, options);
    return true;
}

async function bundle(entries: string[], outFile: string, options: { sourceMap?: boolean; debug?: boolean; }) {
    const rollupPlugins: Plugin[] = [
        rpMultiEntry({ exports: false }),
        rpCommonjs(),
        rpNodeResolve(),
        rpBabel({
            babelHelpers: 'bundled',
            sourceMaps: 'inline',
            plugins: [
            ],
        }),
    ];
    if (options.sourceMap) {
        rollupPlugins.push(rpSourcemaps());
    }
    if (!options.debug) {
        rollupPlugins.push(terser(
            // TODO
        ));
    }

    const rollupOptions: RollupOptions = {
        input: entries,
        plugins: rollupPlugins,
    };

    const rollupBuild = await rollup(rollupOptions);

    const rollupOutputOptions: OutputOptions = {
        format: 'umd',
        name: 'ccEnvBundle',
        file: outFile,
    };
    if (options.sourceMap) {
        rollupOutputOptions.sourcemap = true;
    }

    await rollupBuild.write(rollupOutputOptions);
}

export interface CoreJSBuilderOptions {
    modules?: string[];
    blacklist?: string[];
    targets?: string;
    filename: string;
}

export interface BuildPolyfillsOptions {
    file: string;

    sourceMap?: boolean;

    debug?: boolean;

    coreJs?: boolean | Omit<CoreJSBuilderOptions, 'filename'>,

    asyncFunctions?: boolean;

    fetch?: boolean;
}

export const defaultCoreJsOptions: Omit<CoreJSBuilderOptions, 'filename'> = {
    modules: ['es'],
    blacklist: [],
    targets: '> 0.5%',
};
