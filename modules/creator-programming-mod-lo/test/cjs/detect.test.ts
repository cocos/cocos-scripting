import { detectCjsInfo } from '../../src/cjs/detect';

test('Detect CommonJS requires', async () => {
    expect((await detectCjsInfo(`
        require('foo');
        require("bar");
    `)).requires).toEqual(expect.arrayContaining([
        'foo',
        'bar',
    ]));

    expect((await detectCjsInfo(`
        \`require('foo')\`;
        // in comment require("bar")
    `)).requires).toEqual(expect.arrayContaining([
        // empty
    ]));
});

test('Detect CommonJS exports', async () => {
    const detectResult = await detectCjsInfo(`
        module.exports.foo = foo;
        exports.bar = bar;
        module.exports = require('reexport-foo');
    `);
    expect(detectResult.exports).toEqual(expect.arrayContaining([
        'foo',
        'bar',
    ]));
    expect(detectResult.reexports).toEqual(expect.arrayContaining([
        'reexport-foo',
    ]));
});
