const { join } = require('path');
const { build } = require('../lib/build.js');

(async function () {
    await build({
        out: join(__dirname, '../bin/system.bundle.js'),
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
            exports: 'named'
        }
    });
})();