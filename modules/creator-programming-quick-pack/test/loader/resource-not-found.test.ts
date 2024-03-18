import fsm from '@cocos/creator-programming-test-utils/lib/mock-fs';
import { Volume } from 'memfs';
import { createSimpleRunner } from '../utils/runner';
import { QuickPackLoader, ResourceNotFoundError } from '../../src/loader';
import { pathToFileURL } from 'url';
import ps from 'path';
import { TESTING_MEM_FS_ROOT } from '../mem-fs-root';

test('QuickPackLoader resource not found', async () => {
    const vol = Volume.fromJSON({}, `${TESTING_MEM_FS_ROOT}/`);
    fsm.use(vol);

    const { quickPack } = createSimpleRunner(`${TESTING_MEM_FS_ROOT}/inputs`, `${TESTING_MEM_FS_ROOT}/outputs`);

    await quickPack.build([]);

    const quickPackLoader = new QuickPackLoader(
        await quickPack.createLoaderContext(),
        { baseURL: pathToFileURL(ps.join(`${TESTING_MEM_FS_ROOT}/inputs`, '/')).href },
    );

    await quickPackLoader.reload();

    // TODO
    // expect(quickPackLoader.getResource('file/foo')).rejects.toThrowError(ResourceNotFoundError);
});

test.only('QuickPackLoader API', async () => {
    const vol = Volume.fromJSON({
        'inputs/a.mjs': `import './b.mjs';`,
        'inputs/b.mjs': `export {}`,
    }, `${TESTING_MEM_FS_ROOT}/`);
    fsm.use(vol);

    const { quickPack } = createSimpleRunner(`${TESTING_MEM_FS_ROOT}/inputs`, `${TESTING_MEM_FS_ROOT}/outputs`);

    await quickPack.build([pathToFileURL(ps.join(`${TESTING_MEM_FS_ROOT}/inputs`, 'a.mjs'))]);

    const baseURL = pathToFileURL(ps.join(`${TESTING_MEM_FS_ROOT}/abc/outputs`, '/')).href;

    const quickPackLoader = new QuickPackLoader(
        await quickPack.createLoaderContext(),
        { baseURL: baseURL },
    );

    await quickPackLoader.reload();

    const importMap = await quickPackLoader.loadImportMap();

    expect(importMap).toMatchInlineSnapshot(`
{
  "imports": {
    "file:///.mem/inputs/a.mjs": "./chunks/a4/a4e98cf30fe2c8e1ae1c3c293959f55a485b8e4a.js",
  },
  "scopes": {
    "./chunks/a4/a4e98cf30fe2c8e1ae1c3c293959f55a485b8e4a.js": {
      "__unresolved_0": "./chunks/26/26b0f04bb764dabd167aeb9f81f2b028063da3d9.js",
    },
  },
}
`);

    const resolutionDetailMap = await quickPackLoader.loadResolutionDetailMap();

    expect(resolutionDetailMap).toMatchInlineSnapshot(`{}`);

    // Relative reference, OK
    expect(quickPackLoader.getChunkId('d5/d518afaa5b7b685a2b7b3a0ba5704971ab049499.js?p=q')).
        toMatchInlineSnapshot(`"d5/d518afaa5b7b685a2b7b3a0ba5704971ab049499.js"`);

    // Absolute URL, throw
    expect(() => quickPackLoader.getChunkId(
        new URL('./d5/d518afaa5b7b685a2b7b3a0ba5704971ab049499.js?p=q', baseURL).href)).
        toThrowError();

    // URL that out of base URL, throw
    expect(() => quickPackLoader.getChunkId(
        new URL('..', baseURL).href)).toThrowError();

    // Relative reference that out of base URL, throw
    expect(() => quickPackLoader.getChunkId(
        '..')).toThrowError();

    // Different schema, throw
    expect(() => quickPackLoader.getChunkId(
        'http://google.com')).toThrowError();

    // Different host, throw
    expect(() => quickPackLoader.getChunkId(
        'file://a/d5/d518afaa5b7b685a2b7b3a0ba5704971ab049499.js')).toThrowError();

    // Now let's test if different formals of relative references yields the same result:
    expect(
        quickPackLoader.getChunkId('./d5/d518afaa5b7b685a2b7b3a0ba5704971ab049499.js')
    ).toStrictEqual(
        quickPackLoader.getChunkId('d5/d518afaa5b7b685a2b7b3a0ba5704971ab049499.js')
    );
});
