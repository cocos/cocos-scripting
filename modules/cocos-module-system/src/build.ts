import { rollup } from 'rollup';
import { terser } from 'rollup-plugin-terser';
import replace from '@rollup/plugin-replace';
import { join, parse } from 'path';
import nodeResolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import { renderFile } from 'ejs';
import virtual from './virtual-entry-source.js';

export interface BuildOptions {
    out: string;
    sourceMap: boolean;
    minify: boolean;
    preset: 'web' | 'commonjs-like' | 'node' | 'core';
    runInBrowserEnv: boolean;
    format?: 'iife' | 'commonjs';
    hmr?: boolean;
    editor?: boolean;
    libprogramming?: boolean;
    quickBuildEngine?: boolean;
    inlineDynamicImports?: boolean;
}

export async function build({
    out,
    sourceMap,
    minify,
    preset,
    runInBrowserEnv,
    format,
    hmr = false,
    editor = false,
    libprogramming = false,
    quickBuildEngine = false,
    inlineDynamicImports = false,
}: BuildOptions): Promise<void> {
    const input = join(__dirname, '..', 'runtime-src', 'custom-loaders', 'index.js');
    const ejsResult = await compileEjs(join(__dirname, '..', 'runtime-src', 'custom-loaders', 'index.ejs'), {
        preset,
        runInBrowserEnv,
        hmr,
        editor,
        libprogramming,
        quickBuildEngine,
    });
    const modules: Record<string, string> = {};
    modules[ejsResult.path] = ejsResult.source;

    await (await rollup({
        input,
        plugins: [
            virtual(modules),
            replace({
                preventAssignment: true,
                'process.env.SYSTEM_PRODUCTION': minify ? 'true' : 'false',
                'process.env.SYSTEM_BROWSER': runInBrowserEnv ? 'true' : 'false',
            }),
            nodeResolve({
                // modulesOnly: true,
                preferBuiltins: true,
            }),
            minify ? terser({}) : undefined,
            typescript({ tsconfig: join(__dirname, '../runtime-src/tsconfig.json') }),
            commonjs({
            }),
        ],
    })).write({
        file: out,
        sourcemap: sourceMap,
        format: format ?? 'iife',
        inlineDynamicImports,
    });
}

interface CompileEjsOptions {
    preset: 'web' | 'commonjs-like' | 'node' | 'core';
    runInBrowserEnv: boolean,
    hmr: boolean;
    editor: boolean;
    libprogramming: boolean;
    quickBuildEngine: boolean;
}
interface CompileResult {
    path: string,
    source: string,
}
async function compileEjs (ejsFile: string, options: CompileEjsOptions): Promise<CompileResult> {
    const source = await renderFile(ejsFile, options);
    const parsedPath = parse(ejsFile);
    const path = join(parsedPath.dir, parsedPath.name) + '.js';
    return {
        path,
        source,
    };
}