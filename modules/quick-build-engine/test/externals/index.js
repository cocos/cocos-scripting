
const { bundleExternals } = require('../../dist/bundle-externals');
const ps = require('path');

process.on('uncaughtException', function (exception) {
    console.log(exception); // to see your exception details in the console
});

const printHeap = () => {
    console.log(`${JSON.stringify(process.memoryUsage(), undefined, 2)}`);
};

(async () => {
    printHeap();
    console.time(`External`);
    const build = await bundleExternals([
        ['@cocos/ammo', '@cocos/ammo'],
        ['@cocos/cannon', '@cocos/cannon'],
        ['@cocos/box2d', '@cocos/box2d'],
    ], {
        rootDir: ps.join('x:', 'Repos', 'Cocos', 'engine'),
    });
    console.timeEnd(`External`);
    printHeap();
    global.gc();
    printHeap();
    await build.write({
        format: 'commonjs',
        chunkDir: ps.join(__dirname, 'output'),
    });
})();
