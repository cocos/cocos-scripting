
import { URL, pathToFileURL } from 'url';

const pkgUrl = new URL('../', pathToFileURL(__dirname)).href;

Object.assign(globalThis, {
    QUICK_PACK_TEST_MODULE_URL_HASH_TRANSFORMER(url: string) {
        let hashInput = url;
        if (hashInput.startsWith(pkgUrl)) {
            hashInput = '<pkg>/' + hashInput.slice(pkgUrl.length);
        } else {
            hashInput = '<mem-fs>/' + hashInput.replace(/^.*[\/\\]\.mem[\/\\]/, '')
        }
        return hashInput;
    },
});


