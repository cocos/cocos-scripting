import fsm, { generateAppropriateVirtualFSRootDir } from '@cocos/creator-programming-test-utils/lib/mock-fs';
import { Volume } from 'memfs';
import { createSimpleRunner } from './utils/runner';
import { join } from 'path';
import { pathToFileURL } from 'url';

test('Dynamic import transform', async () => {
    const root = generateAppropriateVirtualFSRootDir();

    const vol = Volume.fromJSON({
        'inputs/a': 'export {};',
    }, root);
    fsm.use(vol);

    const { quickPack, modLo } = createSimpleRunner(join(root, 'inputs'), join(root, 'outputs'));
    modLo.addMemoryModule('foo:/bar', `import('${pathToFileURL(join(root, 'inputs', 'a'))}');`);
    await quickPack.build(['foo:/bar']);
    // vol.toJSON() does not play well with "fs-extra.outputXX"
    // Should use "fs-extra.ensureDir"
    // May be "readdir" could refresh "toJSON"
    // console.log(vol.toJSON());
});
