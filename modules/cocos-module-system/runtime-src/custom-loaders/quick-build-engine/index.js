import fs from 'fs';
import ps from 'path';
import { pathToFileURL } from 'url';

import { engineSystemJSLoader, applyImportMap, loadBundle } from './embedded-systemjs';

let isEngineLoaded = false;

async function ensureEngineLoaded() {
    if (isEngineLoaded) {
        return;
    }

    const importMapFile = ps.join(__dirname, 'import-map.json');
    const importMap = JSON.parse(fs.readFileSync(importMapFile, 'utf8'));
    applyImportMap(engineSystemJSLoader, importMap, pathToFileURL(importMapFile).href);

    await loadBundle(pathToFileURL(ps.join(__dirname, 'bundled', 'index.js')));

    isEngineLoaded = true;
}

const loader = {
    async import(id) {
        await ensureEngineLoaded();
        return engineSystemJSLoader.import(id);
    },
};

export { loader };
