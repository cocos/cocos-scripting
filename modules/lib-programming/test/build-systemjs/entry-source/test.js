

const fs = require('fs-extra');
const ps = require('path');
const { build } = require('../../../dist/build-systemjs');

(async () => {
    const entry = ps.join(__dirname, 'input', 'index.js');
    const entrySource = await fs.readFile(entry, 'utf8') + `\nconsole.log('Should have this!')`;
    await build({
        input: entry,
        inputSource: entrySource,
        out: ps.join(__dirname, 'output', 'system.js'),
    });
})();
