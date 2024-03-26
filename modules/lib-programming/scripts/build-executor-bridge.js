
const { build } = require('../lib/build-systemjs');
const ps = require('path');

(async () => {
    build({
        input: ps.join(__dirname, '..', 'static', 'executor', 'systemjs-bridge', 'index.js'),
        out: ps.join(__dirname, '..', 'static', 'executor', 'systemjs-bridge', 'out', 'index.js'),
        format: 'commonjs',
    });
})();
