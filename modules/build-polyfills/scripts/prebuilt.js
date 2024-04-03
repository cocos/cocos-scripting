// @ts-check

const path = require('path');

const buildPolyfills = require('../dist/index').default;
(async () => {
    // Polyfills for in-editor environment
    await buildPolyfills({
        debug: true,
        sourceMap: true,
        file: path.join(__dirname, '..', 'prebuilt', 'editor', 'bundle.js'),
        coreJs: {
            modules: ['es'],
            targets: 'Electron > 5.0.8',
        },
        fetch: true,
        asyncFunctions: true,
    });

    // Polyfills for pre-view
    await buildPolyfills({
        debug: true,
        sourceMap: true,
        file: path.join(__dirname, '..', 'prebuilt', 'preview', 'bundle.js'),
        coreJs: {
            modules: ['es'],
            targets: '> 0.5%',
        },
        fetch: true,
        asyncFunctions: true,
    });
})();