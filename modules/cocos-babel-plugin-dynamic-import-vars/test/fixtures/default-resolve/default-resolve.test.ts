import createDefaultResolver from '../../../src/default-resolve';
import type { SpecifierParts } from '../../../src';
import ps from 'path';

test('Default resolve', () => {
    const fileName = ps.join(__dirname, 'static', 'index.js');
    const resolver = createDefaultResolver();
    const resolve = (specifierParts: SpecifierParts) => resolver(specifierParts, fileName);
    
    // Specifiers not starts with './' or '../' are not resolved
    expect(resolve([null])).toBe(undefined);
    expect(resolve([null, '.js'])).toBe(undefined);
    expect(resolve(['.', null,'.js'])).toBe(undefined);

    const doubleEach = <T>(arr: T[]) => arr.map((v) => [v, v]);

    // Basic
    expect(resolve(['./', null, '.js'])).toEqual(expect.arrayContaining(doubleEach(['./index.js', './1.js', './2.js'])));
    expect(resolve(['./dir/', null, '.js'])).toEqual(expect.arrayContaining(doubleEach(['./dir/1.js', './dir/2.js'])));

    // '.ts' can be resolved from '.js'
    expect(resolve(['./ts-dir/', null, '.js'])).toEqual(expect.arrayContaining(doubleEach(['./ts-dir/1.js', './ts-dir/2.js'])));
});