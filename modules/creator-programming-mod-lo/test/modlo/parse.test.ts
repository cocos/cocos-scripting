
import { pathToFileURL } from 'url';
import { ModLo } from '../../src/mod-lo';
import ps from 'path';

test('Parse CommonJS modules', async () => {
    const modLo = new ModLo({
        _compressUUID: () => '',
    });
    const file = pathToFileURL(ps.join(__dirname, 'inputs', 'cjs-import-export.js'));
    await expect(modLo.load(file)).rejects.toThrow('Unexpected import statement in CJS module.');
});

test('Abstract class field', async () => {
    const modLo = new ModLo({
        _compressUUID: () => '',
    });
    const file = pathToFileURL(ps.join(__dirname, 'inputs', 'abstract-class-field.ts'));
    await modLo.load(file);
    // await expect(modLo.load(file)).rejects.toThrow('Abstract methods can only appear within an abstract class');
});