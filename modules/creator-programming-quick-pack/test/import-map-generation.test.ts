import fsm from '@cocos/creator-programming-test-utils/lib/mock-fs';
import { Volume } from 'memfs';
import { createSimpleRunner } from './utils/runner';
import ps from 'path';
import { URL, pathToFileURL } from 'url';
import fs from 'fs-extra';
import { IMPORT_MAP_RELATIVE_URL } from '../src/constants';
import { TESTING_MEM_FS_ROOT } from './mem-fs-root';

test('Import map generation BUG 2022.3.28', async () => {
    const vol = Volume.fromJSON({
        'index.mjs': `import './a.mjs'; import './b.mjs';`,
        'a.mjs': `export {};`,
        'b.mjs': `import './c.mjs'`,
        'c.mjs': 'export {};'
    }, `${TESTING_MEM_FS_ROOT}/input`);
    fsm.use(vol);

    const createQuickPack = () => createSimpleRunner(`${TESTING_MEM_FS_ROOT}/input/`, `${TESTING_MEM_FS_ROOT}/output/`);

    const { quickPack } = createQuickPack();
    await quickPack.build([pathToFileURL(`${TESTING_MEM_FS_ROOT}/input/index.mjs`)], { retryResolutionOnUnchangedModule: true  });
    expect(vol.toJSON(`${TESTING_MEM_FS_ROOT}/output/${IMPORT_MAP_RELATIVE_URL}`)).toMatchInlineSnapshot(`
{
  "/.mem/output/import-map.json": "{
  "imports": {
    "file:///.mem/input/index.mjs": "./chunks/e3/e3775f0fdcbc28e3148145c882cc9982d65d4db1.js"
  },
  "scopes": {
    "./chunks/e3/e3775f0fdcbc28e3148145c882cc9982d65d4db1.js": {
      "__unresolved_0": "./chunks/9e/9e1e2c72523abd7715d31891b3f673814f61c405.js",
      "__unresolved_1": "./chunks/e4/e4bd31c14af6153c95d18c1eace0949f55cd7a6c.js"
    },
    "./chunks/e4/e4bd31c14af6153c95d18c1eace0949f55cd7a6c.js": {
      "__unresolved_0": "./chunks/8f/8fb2001d3415b5c95dc92a9e78e1afbb8cdfd380.js"
    }
  }
}
",
}
`);

    const { quickPack: quickPack2 } = createQuickPack();
    await fs.outputFile(`${TESTING_MEM_FS_ROOT}/input/index.mjs`, `import './a.mjs';`);
    await fs.unlink(`${TESTING_MEM_FS_ROOT}/input/b.mjs`);
    await fs.unlink(`${TESTING_MEM_FS_ROOT}/input/c.mjs`);
    await quickPack2.loadCache();
    await quickPack2.build([pathToFileURL(`${TESTING_MEM_FS_ROOT}/input/index.mjs`)], { retryResolutionOnUnchangedModule: true  });

    expect(vol.toJSON(`${TESTING_MEM_FS_ROOT}/output/${IMPORT_MAP_RELATIVE_URL}`)).toMatchInlineSnapshot(`
{
  "/.mem/output/import-map.json": "{
  "imports": {
    "file:///.mem/input/index.mjs": "./chunks/e3/e3775f0fdcbc28e3148145c882cc9982d65d4db1.js"
  },
  "scopes": {
    "./chunks/e3/e3775f0fdcbc28e3148145c882cc9982d65d4db1.js": {
      "__unresolved_0": "./chunks/9e/9e1e2c72523abd7715d31891b3f673814f61c405.js"
    }
  }
}
",
}
`);
});
