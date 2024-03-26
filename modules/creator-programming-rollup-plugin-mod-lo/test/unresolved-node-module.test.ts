
import * as rollup from 'rollup';
import { ModLo } from '@cocos/creator-programming-mod-lo';
import rpModLo from '../src/index';
import ps from 'path';
import { pathToFileURL } from 'url';

test('rollup-plugin-mod-lo unresolved node module', async () => {
    const modLo = new ModLo({
        _compressUUID: (): string => '',
        _helperModule: rpModLo.helperModule,
    });

    const bundle = await rollup.rollup({
        input: pathToFileURL(ps.join(__dirname, 'inputs', 'unresolved-node-module', 'index.cjs')).href,
        plugins: [
            rpModLo({
                modLo,
            }),
        ],
    });

    const { output } = await bundle.generate({
        format: 'systemjs',
        exports: 'auto',
        preserveModules: true,
    });

    for (const chunk of output) {
        if (chunk.type !== 'chunk') {
            continue;
        }
        expect(chunk.code).toMatchSnapshot(`chunk: ${chunk.fileName}`);
    }
});