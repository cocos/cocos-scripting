import { detectImports } from '../../src/transformer/babel/babel-plugins/detect-imports';
import { parse } from '@babel/parser';
import ps from 'path';
import fs from 'fs-extra';

test('Detect ES module imports', async () => {
    const source = await fs.readFile(ps.join(__dirname, 'probe-specifiers', 'input.mjs'), { encoding: 'utf8' });
    expect((await detectImports(await parse(source, {
        sourceType: 'module',
    }))).map((s) => s.value)).toEqual(expect.arrayContaining([
        'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'
    ]));
});
