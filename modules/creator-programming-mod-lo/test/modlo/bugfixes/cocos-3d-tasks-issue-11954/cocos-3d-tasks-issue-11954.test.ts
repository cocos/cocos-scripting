import { URL, pathToFileURL } from "url";
import { ModLo } from "../../../../src/mod-lo";
import ps from 'path';

const dirURL: Readonly<URL> = pathToFileURL(ps.join(__dirname, ps.sep));

test('cocos/3d-tasks#11954', async () => {
    const modLo = new ModLo({
        _compressUUID: (uuid) => uuid,
    });

    const mod = await modLo.load(new URL('input/index.js', dirURL));
    const transformResult = await mod.systemjs((specifier) => specifier);
    expect(transformResult.moduleSpecifiers.length).toBeGreaterThanOrEqual(1);
    expect(transformResult.moduleSpecifiers.map((s) => s.value)).toEqual(expect.arrayContaining(['crypt']));
});