import ps from 'path';
import { URL, pathToFileURL } from 'url';
import { cjsResolve } from '../../../../src/resolver/cjs-resolve';

const dirURL: Readonly<URL> = pathToFileURL(ps.join(__dirname, ps.sep));

describe('Node package', () => {
    test('Node builtin modules in npm', async () => {
        expect((await cjsResolve('path', new URL('specs/node-builtin-modules-in-npm/index.js', dirURL))).href).toEqual(
            new URL('specs/node-builtin-modules-in-npm/node_modules/path/index.js', dirURL).href,
        );
    });
});