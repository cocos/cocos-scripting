// TODO: when loading missed q-bundled:
import { applyImportMap, System as engineSystemJSLoader } from '../../../systemjs/src/system-node';
import '../../../systemjs/src/extras/named-register';

//
import { fileURLToPath } from 'url';
import fs from 'fs';
export { engineSystemJSLoader, applyImportMap, loadBundle };

const systemPrototype = Object.getPrototypeOf(engineSystemJSLoader);
const vendorInstantiate = systemPrototype.instantiate;
systemPrototype.instantiate = async function instantiate(url) {
    if (url.startsWith('file:///')) {
        const path = fileURLToPath(url);
        const source = await fs.promises.readFile(path, { encoding: 'utf8' });
        wrapExecute(source, path);
        return this.getRegister(url);
    } else {
        return vendorInstantiate.apply(this, arguments);
    }
};

async function loadBundle(url) {
    const path = fileURLToPath(url);
    const source = await fs.promises.readFile(path, { encoding: 'utf8' });
    wrapExecute(source, path);
}

function wrapExecute(source, url) {
    const fn = new Function('System', `${source}\n//# sourceURL=${url}`);
    fn(engineSystemJSLoader);
}