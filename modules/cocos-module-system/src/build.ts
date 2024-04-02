import { rollup } from 'rollup';
import { terser } from 'rollup-plugin-terser';
import replace from '@rollup/plugin-replace';
import { join, dirname, basename, parse } from 'path';
import nodeResolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { renderFile } from 'ejs';
import virtual from './virtual-entry-source.js';

interface BuildOptions {
    out: string;
    sourceMap: boolean;
    minify: boolean;
    platform: string;
    hmr?: boolean;
    editor?: boolean;
}

export async function build({
    out,
    sourceMap,
    minify,
    platform,
    hmr = false,
    editor = false,
}: BuildOptions): Promise<void> {
    const input = join(__dirname, '..', 'runtime-src', 'index.js');
    const browser = platform === 'web-mobile' || platform === 'web-desktop' || platform === 'fb-instant-games';
    const ejsResult = await compileEjs(join(__dirname, '..', 'runtime-src', 'index.ejs'), {
        preset: browser ? 'web' : 'commonjs-like',
        hmr,
        editor,
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
                'process.env.SYSTEM_BROWSER': browser ? 'true' : 'false',
            }),
            nodeResolve({
                modulesOnly: true
            }),
            minify ? terser({}) : undefined,
            typescript({ tsconfig: join(__dirname, '../runtime-src/tsconfig.json') }),
        ],
    })).write({
        file: out,
        sourcemap: sourceMap,
        format: 'iife',
    });
}

interface CompileEjsOptions {
    preset: 'web' | 'commonjs-like',
    hmr: boolean,
    editor: boolean,
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