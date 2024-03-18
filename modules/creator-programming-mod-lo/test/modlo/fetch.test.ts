import { AccessDeniedError, FetchFileError, ModLo } from '../../src/mod-lo';
import { pathToFileURL } from 'url';
import ps from 'path';

describe('ModLo fetching', () => {
    const modLo = new ModLo({
        _compressUUID: () => '',
    });

    test('Access denied error', async () => {
        await expect(modLo.load(new URL('foo:/bar'))).rejects.toThrowErrorMatchingInlineSnapshot(`"(i18n needed)modLo_access_denied_error: {"url":"foo:/bar"}(i18n needed)modLo_access_denied_error_default_reason: undefined"`);
        await expect(modLo.load(new URL('node:meow'))).rejects.toThrowErrorMatchingInlineSnapshot(`"(i18n needed)modLo_access_denied_error: {"url":"node:meow"}(i18n needed)modLo_access_denied_error_unsupported_node_builtins: undefined"`);
        await expect(modLo.load(new URL('db://meow/x/y/z'))).rejects.toThrowErrorMatchingInlineSnapshot(`"(i18n needed)modLo_access_denied_error: {"url":"db://meow/x/y/z"}(i18n needed)modLo_access_denied_error_db_not_mounted: {"domain":"meow"}"`);
    });

    test('Fetch file error', async () => {
        await expect(modLo.load(pathToFileURL(ps.join(__dirname, 'non-exist.mjs')))).rejects.toThrowError(FetchFileError);
    });
});