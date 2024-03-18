// import '@types/jest';
import * as babel from '@babel/core';
import { getCjsInteropModuleSource, wrapCjs } from '../../src/cjs/wrapper';
import dedent from 'dedent';
import fs from 'fs-extra';
import ps from 'path';

async function transform(code: string, ...args: Parameters<typeof wrapCjs>): Promise<string> {
    const babelResult = await babel.transform(code, {
        plugins: [ wrapCjs(...args) ],
    });
    return babelResult!.code!.split('\n').filter(line => !!line).join('\n');
}

test('Transform CommonJS wrapper', async () => {
    expect(await transform('', [], [])).toMatchInlineSnapshot(`
"import _loader from "cce:/internal/ml/cjs-loader.mjs";
let _cjsExports;
_loader.define(import.meta.url, function (exports, _require, module, __filename, __dirname) {
  let require = _loader.createRequireWithReqMap({}, _require);
  (function () {})();
  _cjsExports = module.exports;
});
export { _cjsExports as default };
export const __cjsMetaURL = import.meta.url;"
`);

    expect(await transform('', ['default', '__cjsMetaURL'], [])).toMatchInlineSnapshot(`
"import _loader from "cce:/internal/ml/cjs-loader.mjs";
let _cjsExports;
_loader.define(import.meta.url, function (exports, _require, module, __filename, __dirname) {
  let require = _loader.createRequireWithReqMap({}, _require);
  (function () {})();
  _cjsExports = module.exports;
});
export { _cjsExports as default };
export const __cjsMetaURL = import.meta.url;"
`);

    expect(await transform('', ['foo', 'bar'], [])).toMatchInlineSnapshot(`
"import _loader from "cce:/internal/ml/cjs-loader.mjs";
let _cjsExports;
let _foo;
let _bar;
_loader.define(import.meta.url, function (exports, _require, module, __filename, __dirname) {
  let require = _loader.createRequireWithReqMap({}, _require);
  (function () {})();
  _cjsExports = module.exports;
  _foo = module.exports.foo;
  _bar = module.exports.bar;
});
export { _cjsExports as default };
export { _foo as foo, _bar as bar };
export const __cjsMetaURL = import.meta.url;"
`);

    // The default is ignored
    expect(await transform('', ['foo', 'bar', 'default'], [])).toMatchInlineSnapshot(`
"import _loader from "cce:/internal/ml/cjs-loader.mjs";
let _cjsExports;
let _foo;
let _bar;
_loader.define(import.meta.url, function (exports, _require, module, __filename, __dirname) {
  let require = _loader.createRequireWithReqMap({}, _require);
  (function () {})();
  _cjsExports = module.exports;
  _foo = module.exports.foo;
  _bar = module.exports.bar;
});
export { _cjsExports as default };
export { _foo as foo, _bar as bar };
export const __cjsMetaURL = import.meta.url;"
`);

    expect(await getCjsInteropModuleSource('cjs-module-foo')).toMatchInlineSnapshot(`
"// I am the facade module who provides access to the CommonJS module 'cjs-module-foo'~
import { __cjsMetaURL as req } from 'cjs-module-foo';
import loader from 'cce:/internal/ml/cjs-loader.mjs';
if (!req) {
    loader.throwInvalidWrapper('cjs-module-foo', import.meta.url);
}
loader.require(req);
export * from 'cjs-module-foo';
import { default as d } from 'cjs-module-foo'
export { d as default };"
`);
});
