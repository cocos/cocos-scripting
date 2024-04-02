const { join, dirname } = require('path');
const { build } = require('../lib/build.js');

(async function () {
    await build({
        out: join(__dirname, '../bin/system.bundle.js'),
        sourceMap: false,
        minify: false,
        platform: 'windows',
        hmr: true
    });
})();