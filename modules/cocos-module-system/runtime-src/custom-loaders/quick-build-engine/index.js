import fs from 'fs';
import ps from 'path';
import { pathToFileURL } from 'url';

const getOrCreateInternalLoader = (() => {
    let internalLoader;
    let internalLoaderPromise;

    async function createLoader() {
        const { System, applyImportMap, loadBundle } = await import('./embedded-systemjs');

        const importMapFile = ps.join(__dirname, 'import-map.json');
        const importMap = JSON.parse(fs.readFileSync(importMapFile, 'utf8'));
        applyImportMap(System, importMap, pathToFileURL(importMapFile).href);

        await loadBundle(pathToFileURL(ps.join(__dirname, 'bundled', 'index.js')));

        internalLoader = System;
        internalLoaderPromise = undefined;
    }

    return async function () {
        if (!internalLoader) {
            if (!internalLoaderPromise) {
                internalLoaderPromise = createLoader();
            }
            await internalLoaderPromise;
        }
        return internalLoader;
    };
})();

const loader = {
    async import(id) {
        const internalLoader = await getOrCreateInternalLoader();
        return internalLoader.import(id);
    },
};

export { loader };
