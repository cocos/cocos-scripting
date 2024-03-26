
const { build } = require('../lib/build-systemjs');
const ps = require('path');

(async () => {
    build({
        input: ps.join(__dirname, '..', 'static', 'embedded-commonjs-helpers', 'index.js'),
        out: ps.join(__dirname, '..', 'static', 'embedded-commonjs-helpers', 'out', 'index.js'),
        format: 'commonjs',
    });
})();
