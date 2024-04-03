
// @ts-check

const path = require('path');

const buildPolyfills = require('../dist/index').default;
buildPolyfills({
    debug: true,
    sourceMap: true,
    file: path.join(__dirname, 'polyfills.js'),
    fetch: true,
});