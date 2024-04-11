const { join } = require('path');
const { build } = require('@cocos/module-system');

(async function () {
    await build({
        out: join(__dirname, '..', 'static', 'loader.js'),
        sourceMap: false,
        minify: false,
        preset: 'node',
        runInBrowserEnv: false,
        format: 'commonjs',
        hmr: false,
        editor: false,
        libprogramming: false,
        quickBuildEngine: true,
        inlineDynamicImports: true,
        output: {
            banner: 'const editorSystemJSLoader = globalThis.System;',
            footer: 'globalThis.System = editorSystemJSLoader;',
            exports: 'named',
        },
    });
})();