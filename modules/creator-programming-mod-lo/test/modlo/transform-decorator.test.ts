
import { pathToFileURL } from 'url';
import { Mod, ModLo } from '../../src/mod-lo';
import ps from 'path';

// 2022.2.15 If proposal-class-properties is disabled since some reason,
// the decorator proposal would be broken.
test(`Decorators`, async () => {
    const file = pathToFileURL(ps.join(__dirname, 'inputs', 'decorator.ts'));
    const modLo = new ModLo({
        _compressUUID: () => '',
        targets: 'chrome 84', // Under this version, proposal-class-properties would be excluded.
        loose: true,
        useDefineForClassFields: true,
        allowDeclareFields: true,
    });
    const mod = await modLo.load(file);
    const code = (await mod.module()).code;
    expect(code).toMatchSnapshot();
});