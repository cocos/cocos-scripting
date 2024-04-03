
const { build } = require('@cocos/module-system');
const ps = require('path');

(async () => {
    await build({
        out: ps.join(__dirname, '..', 'static', 'executor', 'systemjs-bridge', 'out', 'index.js'),
        sourceMap: false,
        minify: false,
        preset: 'core',
        runInBrowserEnv: true,
        format: 'commonjs',
        hmr: false,
        editor: false,
        libprogramming: true,
    });
})();
