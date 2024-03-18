
import { ModLo } from '../../../../src/mod-lo';
import ps from 'path';
import { URL, pathToFileURL } from 'url';
import { asserts, assertsIsFalse } from '@cocos/creator-programming-common/lib/asserts';
import { unitTestLogger } from '@cocos/creator-programming-test-utils/lib/test-logger';
import { ModuleNotFoundError, UnsupportedDirectoryImportError } from '../../../../src/resolver/resolve-error';

const dirURL: Readonly<URL> = pathToFileURL(ps.join(__dirname, ps.sep));

const modLo = new ModLo({
    _compressUUID: () => '',
    logger: unitTestLogger,
});

describe('Determining module format', () => {
    test('Extension .mjs', async () => {
        expect(await resolveFromEsm('./foo.mjs', new URL('specs/index.mjs', dirURL))).toEqual(
            new URL('specs/foo.mjs', dirURL).href,
        );
    });

    test('Extension .cjs', async () => {
        expect(await resolveFromEsm('./foo.cjs', new URL('specs/index.mjs', dirURL))).toEqual(
            new URL('specs/foo.mjs?cjs=&original=.cjs', dirURL).href,
        );
    });

    test('Extension .js with type field "module"', async () => {
        expect(await resolveFromEsm('./package-type/esm/foo.js', new URL('specs/index.mjs', dirURL))).toEqual(
            new URL('specs/package-type/esm/foo.js', dirURL).href,
        );
    });

    test('Extension .js with type field "commonjs"', async () => {
        expect(await resolveFromEsm('./package-type/commonjs/foo.js', new URL('specs/index.mjs', dirURL))).toEqual(
            new URL('specs/package-type/commonjs/foo.mjs?cjs=&original=.js', dirURL).href,
        );
    });

    test('Non file URL', async () => {
        expect(await resolveFromEsm('foo:/bar', new URL('specs/index.mjs', dirURL))).toEqual(
            new URL('foo:/bar', dirURL).href,
        );
    });

    test('Extension-less resolution is not supported', async () => {
        await expect(resolveFromEsm('./foo', new URL('specs/index.mjs', dirURL))).rejects.toThrowError(ModuleNotFoundError);
    });

    test('Directory import is not supported', async () => {
        await expect(resolveFromEsm('./dir', new URL('specs/index.mjs', dirURL))).rejects.toThrowError(UnsupportedDirectoryImportError);
    });
});

async function resolveFromEsm (specifier: string, parentURL: URL) {
    const resolved = await modLo.resolve(specifier, parentURL, 'esm');
    assertsIsFalse(resolved.isExternal);
    return resolved.url.href;
}