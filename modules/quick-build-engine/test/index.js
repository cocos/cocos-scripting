// @ts-check

console.time('summary');

const ps = require('path');
const { run } = require('./run');

(async () => {
    const engineRoot = ps.join('X:', 'Dev', 'Repos', 'Cocos', 'engine');
    await run(
        engineRoot,
        ps.join(engineRoot, 'bin', '.cache', 'dev8'),
    );

    console.timeEnd('summary');
})();
