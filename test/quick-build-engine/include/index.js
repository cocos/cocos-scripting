// @ts-check

console.time('summary');

const ps = require('path');
const { run } = require('../run');

(async () => {
    const engineRoot = ps.join(__dirname, 'input');
    await run(
        engineRoot,
        ps.join(__dirname, 'output'),
    );

    console.timeEnd('summary');
})();
