const Foo = require('./foo');
const Bar = require('bar');

// These variable names are used accordingly by implementation.
console.log(
    _req,
    _req1,
    _cjsExports,
    _cjsLoader,
    _Test,
);

module.exports = class Test {
    F = new Foo();
    B = new Bar();
}
