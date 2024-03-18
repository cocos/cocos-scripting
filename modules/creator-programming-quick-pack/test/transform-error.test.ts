import fsm, { generateAppropriateVirtualFSRootDir } from '@cocos/creator-programming-test-utils/lib/mock-fs';
import { Volume } from 'memfs';
import { createSimpleRunner } from './utils/runner';
import { spyOnErrorLog } from '@cocos/creator-programming-test-utils/lib/test-logger';
import { LoadErrorValidator } from './utils/load-error-validator';
import { join, sep } from 'path';
import { URL, pathToFileURL } from 'url';

test('QuickPack transform error', async () => {
    const root = generateAppropriateVirtualFSRootDir();
    const rootDirURL = pathToFileURL(join(root, sep));

    const vol = Volume.fromJSON({
        'inputs/a.mjs': ':syntax_error!',
    }, root);
    fsm.use(vol);

    const { quickPack, modLo } = createSimpleRunner(join(root, 'inputs'), join(root, 'outputs'));

    const spy = spyOnErrorLog();

    const confirm = new LoadErrorValidator(await quickPack.createLoaderContext());

    await quickPack.build([new URL('inputs/a.mjs', rootDirURL).href]);
    expect(spy).not.toHaveBeenCalled();
    await expect(confirm.loadOnce(new URL('inputs/a.mjs', rootDirURL))).rejects.toThrowError();

    // Rebuilding should also report the error. Even nothing is changed.
    vol.writeFileSync(join(root, 'inputs', 'a.mjs'), 'export const hello = 6;');
    await quickPack.build([new URL('inputs/a.mjs', rootDirURL).href]);
    expect(spy).not.toHaveBeenCalled();
    await expect(confirm.loadOnce(new URL('inputs/a.mjs', rootDirURL))).resolves.toHaveProperty('hello', 6);
});
