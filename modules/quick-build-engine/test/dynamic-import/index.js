// @ts-check

const ps = require('path');
const { run } = require('../run');

(async () => {
    await run(
        ps.join(__dirname, 'input'),
        ps.join(__dirname, 'output'),
    );
})();
