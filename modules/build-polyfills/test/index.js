
// @ts-check

const path = require('path');

const buildPolyfills = require('../lib/index').default;
buildPolyfills({
    debug: true,
    sourceMap: true,
    file: path.join(__dirname, 'polyfills.js'),
    fetch: true,
});