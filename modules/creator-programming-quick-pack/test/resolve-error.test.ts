import fsm from '@cocos/creator-programming-test-utils/lib/mock-fs';
import { Volume } from 'memfs';
import { createSimpleRunner } from './utils/runner';
import { spyOnErrorLog, spyOnWarnLog } from '@cocos/creator-programming-test-utils/lib/test-logger';
import ps from 'path';
import { RESOLUTION_DETAIL_MAP_RELATIVE_URL } from '../src/constants';
import { ResolutionDetailMap } from '../src/resolution-detail-map';
import { ChunkMessage } from '../src/utils/chunk';
import { LoadErrorValidator } from './utils/load-error-validator';
import { URL, pathToFileURL } from 'url';
import { TESTING_MEM_FS_ROOT } from './mem-fs-root';

const TESTING_MEM_FS_ROOT_URL = pathToFileURL(TESTING_MEM_FS_ROOT) + '/';

describe('QuickPack resolution error', () => {
    const vol = Volume.fromJSON({
        'inputs/a.mjs': 'import "foo";',
        'inputs/b.mjs': 'import "./a";',
        'inputs/import-node-builtin-in-bare.mjs': 'import "fs";',
        'inputs/import-node-builtin-in-url.mjs': 'import "node:fs";',

        'inputs/import-node-builtin-commonjs.mjs': 'import x from "./import-node-builtin-commonjs.cjs"; export { x };',
        'inputs/import-node-builtin-commonjs.cjs': 'require("path");',

        'inputs/clean-resolution/index.mjs': `import 'db://a/b/mapped.mjs';`,
        'inputs/clean-resolution/mapped.mjs': `export {}`,
    }, `${TESTING_MEM_FS_ROOT}/`);
    fsm.use(vol);

    const { quickPack, modLo } = createSimpleRunner(`${TESTING_MEM_FS_ROOT}/inputs`, `${TESTING_MEM_FS_ROOT}/outputs`);

    const buildAndRetrieveResolutionMessages = async (inputs: string[], options?: { retryResolutionOnUnchangedModule?: boolean; }) => {
        const { quickPack, modLo } = createSimpleRunner(`${TESTING_MEM_FS_ROOT}/inputs`, `${TESTING_MEM_FS_ROOT}/outputs`);

        const retrieveResolutionMessages = async () => {
            // expect(spy).toHaveBeenCalled();
            // expect(spy.mock.calls[0][0]).toContain('quick_pack_failed_to_resolve:');
            // expect(spy.mock.calls[0][0]).toContain('foo');
            const resolutionDetailMap: ResolutionDetailMap = JSON.parse(
                await fsm.promises.readFile(ps.join(`${TESTING_MEM_FS_ROOT}/outputs`, RESOLUTION_DETAIL_MAP_RELATIVE_URL), { encoding: 'utf-8' }));
            const chunkMessages = [] as ChunkMessage[];
            for (const [_, specifiers] of Object.entries(resolutionDetailMap)) {
                for (const [_, detail] of Object.entries(specifiers)) {
                    if (detail.error) {
                        chunkMessages.push({ level: 'error', text: detail.error });
                    }
                    if (detail.messages) {
                        chunkMessages.push(...detail.messages);
                    }
                }
            }
            return chunkMessages;
        };

        await quickPack.build(inputs, options);
        const messages = await retrieveResolutionMessages();
        return messages;
    };

    const spy = spyOnErrorLog();
    const warnSpy = spyOnWarnLog();

    beforeEach(() => {
        spy.mockClear();
        warnSpy.mockClear();
    });

    afterEach(() => {
        expect(spy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
    });

    test('Report failed to resolve', async () => {
        const messages = await buildAndRetrieveResolutionMessages([new URL('inputs/a.mjs', TESTING_MEM_FS_ROOT_URL).href]);
        expect(messages).not.toHaveLength(0);
        expect(messages[0].level).toBe('error');
        expect(messages[0].text).toContain('resolve_error_module_not_found:');
        expect(messages[0].text).toContain('foo');
    });

    test('Hints on missing extension', async () => {
        const messages = await buildAndRetrieveResolutionMessages([new URL('inputs/b.mjs', TESTING_MEM_FS_ROOT_URL).href]);
        expect(messages).toHaveLength(2);
        expect(messages[0].text).toContain('resolve_error_module_not_found');
        expect(messages[1].text).toContain('resolve_error_hint_extension');
    });

    test('Hints on loading Node builtin modules(in bare specifier)', async () => {
        await quickPack.build([new URL('inputs/import-node-builtin-in-bare.mjs', TESTING_MEM_FS_ROOT_URL)]);
        expect(warnSpy).not.toHaveBeenCalled();

        const confirm = new LoadErrorValidator(await quickPack.createLoaderContext());
        await expect(confirm.loadOnce(new URL('inputs/import-node-builtin-in-bare.mjs', TESTING_MEM_FS_ROOT_URL))).rejects.toThrowError('modLo_access_denied_error_unsupported_node_builtins');
    });

    test('Hints on loading Node builtin modules(in node URL)', async () => {
        await quickPack.build([new URL('inputs/import-node-builtin-in-url.mjs', TESTING_MEM_FS_ROOT_URL)]);
        expect(warnSpy).not.toHaveBeenCalled();
        
        const confirm = new LoadErrorValidator(await quickPack.createLoaderContext());
        await expect(confirm.loadOnce(new URL('inputs/import-node-builtin-in-bare.mjs', TESTING_MEM_FS_ROOT_URL))).rejects.toThrowError('modLo_access_denied_error_unsupported_node_builtins');
    });

    test.skip('Hints on loading Node builtin modules(in CommonJS)', async () => {
        await quickPack.build([new URL('inputs/import-node-builtin-commonjs.mjs', TESTING_MEM_FS_ROOT_URL)]);
        expect(warnSpy).toHaveBeenCalled();
        expect(warnSpy.mock.calls[0][0]).toContain('load_error_hint_node_builtin');
    });

    test('Rebuilding should not report the error again if nothing is changed', async () => {
        await quickPack.build([new URL('inputs/a.mjs', TESTING_MEM_FS_ROOT_URL)]);
    });

    test('With `retryResolutionOnUnchangedModule` set to true, rebuilding should also report the error. Even nothing is changed', async () => {
        const messages = await buildAndRetrieveResolutionMessages([new URL('inputs/a.mjs', TESTING_MEM_FS_ROOT_URL).href], { retryResolutionOnUnchangedModule: true });
        expect(messages).not.toHaveLength(0);
        expect(messages[0].level).toBe('error');
        expect(messages[0].text).toContain('resolve_error_module_not_found:');
        expect(messages[0].text).toContain('foo');
    });

    test('Clean resolution', async () => {
        const { quickPack, modLo } = createSimpleRunner(`${TESTING_MEM_FS_ROOT}/inputs`, `${TESTING_MEM_FS_ROOT}/outputs`);
        await quickPack.build([new URL('inputs/clean-resolution/index.mjs', TESTING_MEM_FS_ROOT_URL).href], { });

        const load = () => confirm.loadOnce(new URL('inputs/clean-resolution/index.mjs', TESTING_MEM_FS_ROOT_URL));

        const confirm = new LoadErrorValidator(await quickPack.createLoaderContext());
        await expect(load()).rejects.toThrowError('modLo_access_denied_error_db_not_mounted');

        // Now inject the required import map.
        modLo.setImportMap(
            { imports: { 'db://a/b/': './' } },
            new URL('inputs/clean-resolution/import-map.json', TESTING_MEM_FS_ROOT_URL),
        );

        // Keep `cleanResolution` as default
        await quickPack.build([new URL('inputs/clean-resolution/index.mjs', TESTING_MEM_FS_ROOT_URL).href], {
            // default
        });
        // Still error
        await expect(load()).rejects.toThrowError('modLo_access_denied_error_db_not_mounted');

        // With `cleanResolution` set to false
        await quickPack.build([new URL('inputs/clean-resolution/index.mjs', TESTING_MEM_FS_ROOT_URL).href], {
            cleanResolution: false,
        });
        // Still error
        await expect(load()).rejects.toThrowError('modLo_access_denied_error_db_not_mounted');

        // With `cleanResolution` set to true
        await quickPack.build([new URL('inputs/clean-resolution/index.mjs', TESTING_MEM_FS_ROOT_URL).href], {
            cleanResolution: true,
        });
        // No longer error
        await expect(load()).resolves.not.toThrow();
    });
});
