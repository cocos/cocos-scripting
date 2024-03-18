import * as ps from 'path';
import { ModLo } from '../../src/mod-lo';
import { pathToFileURL } from 'url';

const projectPatterns = ps.join(__dirname, './inputs/import-restriction/**/*');
const editorPatterns = ps.join(__dirname, './inputs/import-restriction/editor/**/*');
const modLo = new ModLo({
    _compressUUID: () => '',
    importRestrictions: [
        {
            importerPatterns: [
                projectPatterns,
                '!' + editorPatterns,
            ],
            banSourcePatterns: [
                editorPatterns,
                'cc/editor',
            ],
        }
    ],
});

modLo.setExternals(['cc/editor']);

describe('import restriction', () => {
    test('import correct module', async () => {
        const file1 = pathToFileURL(ps.join(__dirname, './inputs/import-restriction/import-good.mjs'));
        await expect(modLo.resolve('./test-module.mjs', file1)).resolves.not.toThrowError();

        const file2 = pathToFileURL(ps.join(__dirname, './inputs/import-restriction/editor/index.mjs'));
        await expect(modLo.resolve('../test-module.mjs', file2)).resolves.not.toThrowError();
        await expect(modLo.resolve('cc/editor', file2)).resolves.not.toThrowError();
    });
    
    test('import wrong module', async () => {
        const file1 = pathToFileURL(ps.join(__dirname, './inputs/import-restriction/import-wrong-1.mjs'));
        await expect(modLo.resolve('./editor/index.mjs', file1)).rejects.toThrowError(/Cannot import '.*' from '.*'/);

        const file2 = pathToFileURL(ps.join(__dirname, './inputs/import-restriction/import-wrong-2.mjs'));
        await expect(modLo.resolve('cc/editor', file2)).rejects.toThrowError(/Cannot import 'cc\/editor' from '.*'/);
    });
})
