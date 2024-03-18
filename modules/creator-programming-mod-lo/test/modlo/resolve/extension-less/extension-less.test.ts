
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

modLo.setAssetPrefixes([new URL('assets', dirURL).href]);

test('Extension-less resolution', async () => {
    // Extension-less resolution is only allowed when TypeScript importing TypeScript, in asset dir.
    
    expect(await resolveFromEsm('./mod-ts', new URL('assets/index.ts', dirURL))).toEqual(
        new URL('assets/mod-ts.ts', dirURL).href,
    );

    expect(await resolveFromEsm('./dir-mod-ts', new URL('assets/index.ts', dirURL))).toEqual(
        new URL('assets/dir-mod-ts/index.ts', dirURL).href,
    );

    // All other fails.

    await expect(resolveFromEsm('./mod-ts', new URL('assets/index.js', dirURL))).rejects.toThrowError(ModuleNotFoundError);
    await expect(resolveFromEsm('./mod-ts', new URL('assets/index.mjs', dirURL))).rejects.toThrowError(ModuleNotFoundError);
    await expect(resolveFromEsm('./mod-ts', new URL('assets/index.cjs', dirURL))).rejects.toThrowError(ModuleNotFoundError);

    await expect(resolveFromEsm('./dir-mod-ts', new URL('assets/index.js', dirURL))).rejects.toThrowError(UnsupportedDirectoryImportError);
    await expect(resolveFromEsm('./dir-mod-ts', new URL('assets/index.mjs', dirURL))).rejects.toThrowError(UnsupportedDirectoryImportError);
    await expect(resolveFromEsm('./dir-mod-ts', new URL('assets/index.cjs', dirURL))).rejects.toThrowError(UnsupportedDirectoryImportError);

    await expect(resolveFromEsm('./mod-js', new URL('assets/index.ts', dirURL))).rejects.toThrowError(ModuleNotFoundError);
    await expect(resolveFromEsm('./mod-js', new URL('assets/index.js', dirURL))).rejects.toThrowError(ModuleNotFoundError);
    await expect(resolveFromEsm('./mod-js', new URL('assets/index.mjs', dirURL))).rejects.toThrowError(ModuleNotFoundError);
    await expect(resolveFromEsm('./mod-js', new URL('assets/index.cjs', dirURL))).rejects.toThrowError(ModuleNotFoundError);
    
    await expect(resolveFromEsm('./dir-mod-js', new URL('assets/index.ts', dirURL))).rejects.toThrowError(UnsupportedDirectoryImportError);
    await expect(resolveFromEsm('./dir-mod-js', new URL('assets/index.js', dirURL))).rejects.toThrowError(UnsupportedDirectoryImportError);
    await expect(resolveFromEsm('./dir-mod-js', new URL('assets/index.mjs', dirURL))).rejects.toThrowError(UnsupportedDirectoryImportError);
    await expect(resolveFromEsm('./dir-mod-js', new URL('assets/index.cjs', dirURL))).rejects.toThrowError(UnsupportedDirectoryImportError);

    await expect(resolveFromEsm('./mod', new URL('out-of-assets/index.ts', dirURL))).rejects.toThrowError(ModuleNotFoundError);
    await expect(resolveFromEsm('./dir-mod', new URL('out-of-assets/index.ts', dirURL))).rejects.toThrowError(UnsupportedDirectoryImportError);
});

async function resolveFromEsm(specifier: string, parentURL: URL, modLoOverride?: ModLo) {
    const resolved = await (modLoOverride ?? modLo).resolve(specifier, parentURL, 'esm');
    assertsIsFalse(resolved.isExternal);
    return resolved.url.href;
}
