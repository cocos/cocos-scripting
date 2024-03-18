import { __cjsMetaURL as _lib } from "./lib";
import _loader from "cce:/internal/ml/cjs-loader.mjs";
let _cjsExports;
let _a;
let _b;
_loader.define(import.meta.url, function __execute_cjs__(exports, require, module, __filename, __dirname) {
    let require = _loader.createRequireWithReqMap({
        "./lib": _lib
    }, require);
    (function __execute_cjs__1() {
        const c = require('./lib');
        exports.a = c;
        module.exports.b = c;
    })();
    _cjsExports = module.exports;
    _a = module.exports.a;
    _b = module.exports.b;
});
export { a as _a, b as _b };
export { _cjsExports as default };
export const __cjsMetaURL = import.meta.url;
