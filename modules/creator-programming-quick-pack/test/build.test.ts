import fsm from '@cocos/creator-programming-test-utils/lib/mock-fs';
import { Volume } from 'memfs';
import { createSimpleRunner } from './utils/runner';
import { spyOnErrorLog, spyOnInfoLog, spyOnWarnLog } from '@cocos/creator-programming-test-utils/lib/test-logger';
import ps from 'path';
import { URL, pathToFileURL } from 'url';
import RelateUrl from 'relateurl';
import { ImportMap } from '@cocos/creator-programming-mod-lo';
import fs from 'fs-extra';
import { RESOLUTION_DETAIL_MAP_RELATIVE_URL } from '../src/constants';
import { TESTING_MEM_FS_ROOT } from './mem-fs-root';

const caseHomeDir = ps.join(__dirname, 'cases');
const caseDirNames = fsm.readdirSync(caseHomeDir);

describe('QuickPack build', () => {
    const vol = Volume.fromJSON({
    }, '/mem');
    fsm.use(vol);

    const errorSpy = spyOnErrorLog();
    const warnSpy = spyOnWarnLog();
    const infoSpy = spyOnInfoLog();

    beforeEach(() => {
        errorSpy.mockClear();
        warnSpy.mockClear();
    });

    test.each(caseDirNames.map((caseDirName) => {
        return [caseDirName, {
            caseName: caseDirName,
            caseDirName: caseDirName,
            caseDir: ps.join(caseHomeDir, caseDirName),
        }] as const;
    }))(`Case %#: %s`, async (_, { caseName, caseDirName, caseDir }) => {
        const caseInputDir = ps.join(caseDir, 'input');
        const entryPaths = [ps.join(ps.join(caseInputDir, 'index.mjs'))];
        const outputDir = ps.join(`/mem/${caseDirName}/outputs`);

        let options: {
            modLo?: {
                externals?: string[];
                importMap?: ImportMap;
            };
        } | undefined;
        try {
            ({ default: options } = await import(ps.join(caseDir, 'config')));
        } catch { }

        const { modLo, quickPack } = createSimpleRunner(caseDir, outputDir);

        if (options?.modLo?.externals) {
            modLo.setExternals(options.modLo.externals);
        }

        if (options?.modLo?.importMap) {
            modLo.setImportMap(options.modLo.importMap, new URL('foo:/bar'));
        }

        // To prevent the import map generate some absolute URL...
        const proxyEntryURLs: URL[] = [];
        for (const entryPath of entryPaths) {
            const entryURL = pathToFileURL(entryPath);
            const proxyEntryURLRelative = RelateUrl.relate(pathToFileURL(caseInputDir).href, entryURL.href);
            const proxyEntryURL = new URL(proxyEntryURLRelative, 'virtual:/proxy-entries/');
            modLo.addMemoryModule(proxyEntryURL, `export * from '${entryURL.href}';`);
            proxyEntryURLs.push(proxyEntryURL);
        }

        await quickPack.build(proxyEntryURLs);

        const json = vol.toJSON(outputDir, {}, true);
        delete json['main-record.json'];
        delete json['assembly-record.json'];
        expect(errorSpy).not.toBeCalled();
        expect(warnSpy).not.toBeCalled();
        expect(infoSpy).not.toBeCalled();
        expect(json).toMatchSnapshot();
    });
});

test('Build error module more than one', async () => {
    const vol = Volume.fromJSON({
        'index.mjs': `import './a.mjs'`,
        'a.mjs': `export {};`,
    }, `${TESTING_MEM_FS_ROOT}/input`);
    fsm.use(vol);

    const { quickPack } = createSimpleRunner(`${TESTING_MEM_FS_ROOT}/input/`, `${TESTING_MEM_FS_ROOT}/output/`);
    await quickPack.build([pathToFileURL(`${TESTING_MEM_FS_ROOT}/input/index.mjs`)], { retryResolutionOnUnchangedModule: true  });
    expect(vol.toJSON(`${TESTING_MEM_FS_ROOT}/output/${RESOLUTION_DETAIL_MAP_RELATIVE_URL}`)).toMatchInlineSnapshot(`
{
  "/.mem/output/resolution-detail-map.json": "{}
",
}
`);

    await fs.outputFile(`${TESTING_MEM_FS_ROOT}/input/index.mjs`, `import './a.mjs';\nimport './b.mjs';`);
    await fs.outputFile(`${TESTING_MEM_FS_ROOT}/input/b.mjs`, `import './c.mjs';`);
    await quickPack.build([pathToFileURL(`${TESTING_MEM_FS_ROOT}/input/index.mjs`)], { retryResolutionOnUnchangedModule: false  });
    expect(JSON.stringify(vol.toJSON(`${TESTING_MEM_FS_ROOT}/output/${RESOLUTION_DETAIL_MAP_RELATIVE_URL}`))).toContain(
        '(i18n needed)resolve_error_module_not_found');

    await quickPack.build([pathToFileURL(`${TESTING_MEM_FS_ROOT}/input/index.mjs`)], { retryResolutionOnUnchangedModule: false  });
    expect(JSON.stringify(vol.toJSON(`${TESTING_MEM_FS_ROOT}/output/${RESOLUTION_DETAIL_MAP_RELATIVE_URL}`))).toContain(
        '(i18n needed)resolve_error_module_not_found');
});
