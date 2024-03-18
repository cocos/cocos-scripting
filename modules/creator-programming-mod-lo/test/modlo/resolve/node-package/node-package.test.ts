
import { ModLo } from '../../../../src/mod-lo';
import ps from 'path';
import { URL, pathToFileURL } from 'url';
import { asserts, assertsIsFalse } from '@cocos/creator-programming-common/lib/asserts';
import { unitTestLogger } from '@cocos/creator-programming-test-utils/lib/test-logger';
import { InvalidModuleSpecifierError, InvalidPackageConfigurationError, ModuleNotFoundError, PackagePathNotExportedError } from '../../../../src/resolver/resolve-error';

const dirURL: Readonly<URL> = pathToFileURL(ps.join(__dirname, ps.sep));

const modLo = new ModLo({
    _compressUUID: () => '',
    logger: unitTestLogger,
});

describe('Node package', () => {
    test('invalid package name', async () => {
        await expect(resolveFromEsm('@foo', new URL('specs/dummy.js', dirURL)))
            .rejects
            .toThrowError(InvalidModuleSpecifierError);
        await expect(resolveFromEsm('.foo', new URL('specs/dummy.js', dirURL)))
            .rejects
            .toThrowError(InvalidModuleSpecifierError);
        await expect(resolveFromEsm('f%oo', new URL('specs/dummy.js', dirURL)))
            .rejects
            .toThrowError(InvalidModuleSpecifierError);
        await expect(resolveFromEsm('fo\\o', new URL('specs/dummy.js', dirURL)))
            .rejects
            .toThrowError(InvalidModuleSpecifierError);
    });

    test('import scoped package', async () => {
        expect(await resolveFromEsm('@org/foo', new URL('specs/scoped-package/index.js', dirURL))).toEqual(
            new URL('specs/scoped-package/node_modules/@org/foo/index.mjs?cjs=&original=.js', dirURL).href,
        );
    });

    test('import scoped package subpath', async () => {
        expect(await resolveFromEsm('@org/foo/index.js', new URL('specs/scoped-package/index.js', dirURL))).toEqual(
            new URL('specs/scoped-package/node_modules/@org/foo/index.mjs?cjs=&original=.js', dirURL).href,
        );
    });

    test('no main field', async () => {
        expect(await resolveFromEsm('foo', new URL('specs/main-resolve-no-main-field/index.js', dirURL))).toEqual(
            new URL('specs/main-resolve-no-main-field/node_modules/foo/index.mjs?cjs=&original=.js', dirURL).href,
        );
    });

    test('main field specified', async () => {
        expect(await resolveFromEsm('foo', new URL('specs/main-resolve-main-field-specified/index.js', dirURL))).toEqual(
            new URL('specs/main-resolve-main-field-specified/node_modules/foo/bar.mjs?cjs=&original=.js', dirURL).href,
        );
    });

    test('conditional exports', async () => {
        // Simulated from https://github.com/uuidjs/uuid/blob/master/package.json
        expect(await resolveFromEsm('foo', new URL('specs/conditional-exports/index.js', dirURL))).toEqual(
            new URL('specs/conditional-exports/node_modules/foo/esm/default.mjs', dirURL).href,
        );
    });

    test('conditional exports(yargs)', async () => {
        // Simulated from https://github.com/yargs/yargs/blob/master/package.json

        expect(await resolveFromEsm('yargs', new URL('specs/conditional-exports-yargs/index.js', dirURL))).toEqual(
            new URL('specs/conditional-exports-yargs/node_modules/yargs/index.mjs', dirURL).href,
        );

        expect(await resolveFromEsm('yargs/helpers', new URL('specs/conditional-exports-yargs/index.js', dirURL))).toEqual(
            new URL('specs/conditional-exports-yargs/node_modules/yargs/helpers/helpers.mjs', dirURL).href,
        );
    });

    test('conditional exports(foo-with-cc-export)', async () => {
        expect(await resolveFromEsm('foo-with-cc-export', new URL('specs/conditional-exports/index.js', dirURL))).toEqual(
            new URL('specs/conditional-exports/node_modules/foo-with-cc-export/esm/cc.mjs', dirURL).href,
        );
    });

    test('custom exports conditions', async () => {
        const modLo = new ModLo({
            _compressUUID: () => '',
            logger: unitTestLogger,
        });

        modLo.setExtraExportsConditions(['browser']);

        expect(await resolveFromEsm('foo', new URL('specs/custom-exports-conditions/index.js', dirURL), modLo)).toEqual(
            new URL('specs/custom-exports-conditions/node_modules/foo/browser-main.mjs', dirURL).href,
        );
    });

    test('Package search', async () => {
        // Nearest
        expect(await resolveFromEsm('p-2', new URL('specs/package-search/a/b/index.js', dirURL))).toEqual(
            new URL('specs/package-search/a/b/node_modules/p-2/index.mjs', dirURL).href,
        );

        // Propagation
        expect(await resolveFromEsm('p-1', new URL('specs/package-search/a/b/index.js', dirURL))).toEqual(
            new URL('specs/package-search/a/node_modules/p-1/index.mjs', dirURL).href,
        );

        // Propagation, again
        expect(await resolveFromEsm('p-0', new URL('specs/package-search/a/b/index.js', dirURL))).toEqual(
            new URL('specs/package-search/node_modules/p-0/index.mjs', dirURL).href,
        );

        // package.json can be omitted
        expect(await resolveFromEsm('p-1-no-package-json/index.mjs', new URL('specs/package-search/a/b/index.js', dirURL))).toEqual(
            new URL('specs/package-search/a/node_modules/p-1-no-package-json/index.mjs', dirURL).href,
        );

        // Siblings won't bother.
        await expect(resolveFromEsm('p-3', new URL('specs/package-search/a/b/index.js', dirURL)))
            .rejects.toThrowError(ModuleNotFoundError);
    });

    test(`Exports field`, async () => {
        const r = (specifier: string) =>
            resolveFromEsm(specifier, new URL('specs/exports-field/some.js', dirURL));
        
        await expect(r('main-sugar-string'))
            .resolves
            .toEqual(new URL('specs/exports-field/node_modules/main-sugar-string/abc.js', dirURL).href);

        await expect(r('main-sugar-array'))
            .resolves
            .toEqual(new URL('specs/exports-field/node_modules/main-sugar-array/b.js', dirURL).href);

        await expect(r('main-sugar-object'))
            .resolves
            .toEqual(new URL('specs/exports-field/node_modules/main-sugar-object/a.js', dirURL).href);  

        await expect(r('main-sugar-object-bad'))
            .rejects
            .toThrowError(InvalidPackageConfigurationError);

        await expect(r('pattern/empty-trailer/a'))
            .resolves
            .toEqual(new URL('specs/exports-field/node_modules/pattern/lib/if-empty-trailer/a.js', dirURL).href);

        await expect(r('pattern/empty-trailer/nested/b'))
            .resolves
            .toEqual(new URL('specs/exports-field/node_modules/pattern/lib/if-empty-trailer/nested/b.js', dirURL).href);

        await expect(r('pattern/non-empty-trailer/a.test'))
            .resolves
            .toEqual(new URL('specs/exports-field/node_modules/pattern/lib/if-non-empty-trailer/a.t.mjs', dirURL).href);
        
        await expect(r('pattern/non-empty-trailer/a.not-match'))
            .rejects
            .toThrowError(PackagePathNotExportedError);
    });

    test('Node builtin modules in npm', async () => {
        expect(await resolveFromEsm('buffer', new URL('specs/node-builtin-modules-in-npm/index.js', dirURL))).toEqual(
            new URL('specs/node-builtin-modules-in-npm/node_modules/buffer/index.mjs', dirURL).href,
        );
    });
});

async function resolveFromEsm(specifier: string, parentURL: URL, modLoOverride?: ModLo) {
    const resolved = await (modLoOverride ?? modLo).resolve(specifier, parentURL, 'esm');
    assertsIsFalse(resolved.isExternal);
    return resolved.url.href;
}
