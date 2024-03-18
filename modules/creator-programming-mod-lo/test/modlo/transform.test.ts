
import { pathToFileURL } from 'url';
import { Mod, ModLo } from '../../src/mod-lo';
import ps from 'path';
import { SpecifierParts } from '../../src/transformer/babel/babel-plugins/dynamic-import-vars';
import * as babel from '@babel/core';
import decomposeDynamicImportVars from '../../src/transformer/babel/babel-plugins/dynamic-import-vars/decompose-dynamic-import-vars';
import createDefaultResolver from '../../src/transformer/babel/babel-plugins/dynamic-import-vars/default-resolve';

describe('Transform CommonJS modules', () => {
    test.each([
        ['ESM', true],
        ['SystemJS', false],
    ])(`%s`, async (_title, isEsm) => {
        const file = pathToFileURL(ps.join(__dirname, 'inputs', 'cjs-es6.js'));
        const modLo = new ModLo({
            _compressUUID: () => '',
            transformExcludes: [
                file.href,
            ],
        });
        const mod = await modLo.load(file);
        const code = isEsm
            ? (await mod.module()).code
            : (await mod.systemjs()).source.code
            ;
        expect(code).toMatchSnapshot(`isEsm: ${isEsm}`);
    });
});

describe('Transform option: _importMetaURLValid', () => {
    test.each([
        [true],
        [false],
    ])(`%s`, async (importMetaURLValid) => {
        const modLo = new ModLo({
            _compressUUID: () => '',
            _importMetaURLValid: importMetaURLValid,
        });
        const url = pathToFileURL(ps.join(__dirname, 'inputs', 'cjs-import-meta-url-valid.js'));
        const mod = await modLo.load(url);
        const code = (await mod.module()).code;
        expect(code).toMatchSnapshot();
    });
});

test('Transform JSON module', async () => {
    const modLo = new ModLo({
        _compressUUID: () => '',
    });
    const file = pathToFileURL(ps.join(__dirname, 'inputs', 'json-module.json'));
    const mod = await modLo.load(file);
    const code = (await toEsm(mod)).code;
    expect(code).toMatchSnapshot();
});

describe('Transform options: useDefineForClassFields', () => {
    test.each([
        [true],
        [false],
    ])(`%s`, async (useDefineForClassFields) => {
        const file = pathToFileURL(ps.join(__dirname, 'inputs', 'use-define-for-class-fields.mjs'));
        const modLo = new ModLo({
            _compressUUID: () => '',
            useDefineForClassFields,
        });
        const mod = await modLo.load(file);
        const code = (await mod.module()).code;
        expect(code).toMatchSnapshot(`${useDefineForClassFields}`);
    });
});

describe('Transform options: useDefineForClassFields & allowDeclareFields', () => {
    test.each([
        [true, true],
        [false, false],
        [true, false],
        [false, true],
    ])(`useDefineForClassFields: %s & allowDeclareFields: %s`, async (useDefineForClassFields, allowDeclareFields) => {
        const file = pathToFileURL(ps.join(__dirname, 'inputs', 'use-define-for-class-fields-and-allow-declare-fields.ts'));
        const modLo = new ModLo({
            _compressUUID: () => '',
            useDefineForClassFields,
            allowDeclareFields,
        });
        const mod = await modLo.load(file);
        const code = (await mod.module()).code;
        expect(code).toMatchSnapshot();
    });
});

describe('Transform options: loose', () => {
    test.each([
        [true],
        [false],
    ])(`%s`, async (loose) => {
        const file = pathToFileURL(ps.join(__dirname, 'inputs', 'loose.mjs'));
        const modLo = new ModLo({
            _compressUUID: () => '',
            loose,
        });
        const mod = await modLo.load(file);
        const code = (await mod.module()).code;
        expect(code).toMatchSnapshot();
    });
});

describe('Transform options: dynamic import vars', () => {
    test('Decompose', async () => {
        await x("import('a.js')", ['a.js']);
        await x("import(`a.js`)", ['a.js']);
        await x("import('a' + '.js')", ['a.js']);
        await x("import(a)", [null]);
        await x("import(`./${a}.js`)", ['./', null, '.js']);
        await x("import(`${a}.js`)", [null, '.js']);
        await x("import(`./${a}`)", ['./', null]);

        async function x(code: string, result: SpecifierParts) {
            const ast = await babel.parseAsync(code, {});
    
            expect(ast).not.toBeNull();
    
            const imports: babel.types.Expression[] = [];
            babel.traverse(ast, {
                CallExpression(path) {
                    if (path.node.callee.type === 'Import') {
                        if (path.node.arguments.length === 1 &&
                            babel.types.isExpression(path.node.arguments[0])) {
                            imports.push(path.node.arguments[0]);
                        }
                    }
                },
            });
            expect(imports.length === 1);
    
            const parts = decomposeDynamicImportVars(imports[0]);
    
            expect(parts).toEqual(expect.arrayContaining(result));;
        }
    });

    test('Default resolve', async () => {
        const fileName = ps.join(__dirname, 'inputs', 'dynamic-import-vars-default-resolve', 'index.js');
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
});

test('Bugfix cocos/cocos-engine#11373', async () => {
    const modLo = new ModLo({
        _compressUUID: () => '',
    });
    const file = pathToFileURL(ps.join(__dirname, 'inputs', 'bugfix#11373', 'assets', 'scripts', 'login', 'AppVersion.js'));
    const mod = await modLo.load(file);
    const code = (await mod.module()).code;
    expect(code).toMatchSnapshot();
});

async function toEsm(mod: Mod) {
    return await mod.module();
}
