
import * as rollup from 'rollup';
import { terser } from 'rollup-plugin-terser';
import replace from '@rollup/plugin-replace';
import resolveSystemJsSpecifier from './resolve-systemjs-specifier';
import virtual from './virtual-entry-source';

export async function build({
    input,
    inputSource,
    sourceMap,
    minify,
    out,
    browser,
    format,
}: {
    input: string;
    inputSource?: string;
    out: string;
    sourceMap?: boolean;
    minify?: boolean;
    browser?: boolean;
    format?: 'systemjs' | 'commonjs';
}): Promise<void> {
    const modules: Record<string, string> = {};
    if (inputSource !== undefined) {
        modules[input] = inputSource;
    }
    await (await rollup.rollup({
        input,
        plugins: [
            virtual(modules),
            resolveSystemJsSpecifier,
            replace({
                // @ts-ignore This option in `@rollup/plugin-replace@2.3.3` is default to `false`.
                // It is recommended to set this option to `true`, as the next major version will default this option to `true`.
                preventAssignment: false,
                'process.env.SYSTEM_PRODUCTION': minify ? 'true' : 'false',
                'process.env.SYSTEM_BROWSER': (browser ?? true) ? 'true' : 'false',
            }),
            minify ? terser({}) : undefined!,
        ],
    })).write({
        file: out,
        sourcemap: sourceMap,
        format: format ?? 'iife',
    });
}
