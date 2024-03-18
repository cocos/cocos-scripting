import { createDetailResolver, setResolutionDetailMap } from './detail-resolver';

const resolveDetail = createDetailResolver();

const systemJSPrototype = System.constructor.prototype;

const vendorPrepareImport = systemJSPrototype.prepareImport;
systemJSPrototype.prepareImport = async function() {
    await prepareImport();
    await vendorPrepareImport.apply(this, arguments);
};

const vendorResolve = systemJSPrototype.resolve;
systemJSPrototype.resolve = (specifier, importer) => {
    void resolveDetail(specifier, importer);
    return vendorResolve.apply(this, arguments);
};

async function prepareImport() {
    await loadImportMap();
    await loadResolutionDetailMap();
}

async function loadImportMap() {
    const importMapElement = document.createElement('script');
    importMapElement.type = 'systemjs-importmap';
    importMapElement.src = IMPORT_MAP_URL;
    document.head.appendChild(importMapElement);
}

async function loadResolutionDetailMap() {
    try {
        const response = await fetch(RESOLUTION_DETAIL_MAP_URL);
        const json = JSON.parse(await response.json());
        setResolutionDetailMap(json, RESOLUTION_DETAIL_MAP_URL);
    } catch (err) {
        console.debug(`Failed to load resolution detail map at ${RESOLUTION_DETAIL_MAP_URL}: ${err}`);
    }
}
