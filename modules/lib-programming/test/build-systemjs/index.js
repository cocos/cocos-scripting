
const ps = require('path');
const { build } = require('../../dist/build-systemjs');

(async () => {
    await build({
        input: ps.join(__dirname, 'res', 'wrap-system.js'),
        out: ps.join(__dirname, 'out', 'system.js'),
    });
})();
