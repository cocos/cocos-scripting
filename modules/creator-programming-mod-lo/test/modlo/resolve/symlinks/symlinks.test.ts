import { asserts, assertsIsFalse } from "@cocos/creator-programming-common/lib/asserts";
import { unitTestLogger } from "@cocos/creator-programming-test-utils/lib/test-logger";
import { ModLo } from "../../../../src/mod-lo";
import { URL, pathToFileURL } from "url";
import ps, { join } from 'path';
import { readJson } from "fs-extra";
import { ModuleNotFoundError } from "../../../../src/resolver/resolve-error";
import '../resolve-result-matcher';
import { genSymLinks } from "./gen-sym-links";

const dirURL: Readonly<URL> = pathToFileURL(ps.join(__dirname, ps.sep));

beforeAll(() => {
    genSymLinks();
});

test(`preserveSymlinks: false`, async () => {
    const modLo = new ModLo({
        _compressUUID: () => '',
        logger: unitTestLogger,
        preserveSymlinks: false,
    });

    const specDirURL = new URL('spec/', dirURL);

    expect(await modLo.resolve('./symlink.ts', specDirURL)).toEqualResolveResult({
        isExternal: false,
        url: new URL('spec/target.ts', dirURL),
    });

    expect(await modLo.resolve('./target.ts', specDirURL)).toEqualResolveResult({
        isExternal: false,
        url: new URL('spec/target.ts', dirURL),
    });
});

test(`preserveSymlinks: true`, async () => {
    const modLo = new ModLo({
        _compressUUID: () => '',
        logger: unitTestLogger,
        preserveSymlinks: true,
    });

    const specDirURL = new URL('spec/', dirURL);

    expect(await modLo.resolve('./symlink.ts', specDirURL)).toEqualResolveResult({
        isExternal: false,
        url: new URL('spec/symlink.ts', dirURL),
    });

    expect(await modLo.resolve('./target.ts', specDirURL)).toEqualResolveResult({
        isExternal: false,
        url: new URL('spec/target.ts', dirURL),
    });
});

test(`preserveSymlinks, asset prefix and import map`, async () => {
    const modLo = new ModLo({
        _compressUUID: () => '',
        logger: unitTestLogger,
        preserveSymlinks: false,
    });

    const importMapURL = new URL('spec/import-map.json', dirURL);
    const importMap = {
        imports: {
            "ji_ni_tai_mei/": "./assets-symlink/"
        }
    };
    modLo.setImportMap(importMap, importMapURL);

    // Symlinks are resolved after import map applied.
    const resolveResult_a = await modLo.resolve('ji_ni_tai_mei/a.ts');
    expect(resolveResult_a).toEqualResolveResult({
        isExternal: false,
        url: new URL('spec/assets-real/a.ts', dirURL),
    });
    assertsIsFalse(resolveResult_a.isExternal);

    // First check if it rejects without the "asset prefix".
    await expect(modLo.resolve('./b', resolveResult_a.url)).rejects.toThrowError(ModuleNotFoundError);
    // Then checks the effect of "asset prefix".
    // The asset prefix would be symlink-resolved.
    modLo.setAssetPrefixes([new URL('spec/assets-symlink/', dirURL).href]);
    const resolveResult_b = await modLo.resolve('./b', resolveResult_a.url);
    expect(resolveResult_b).toEqualResolveResult({
        isExternal: false,
        url: new URL('spec/assets-real/b.ts', dirURL),
    });
});
