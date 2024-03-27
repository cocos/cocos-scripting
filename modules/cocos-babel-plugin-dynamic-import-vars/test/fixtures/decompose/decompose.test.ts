import { SpecifierParts } from '../../../src';
import * as babel from '@babel/core';
import decomposeDynamicImportVars from '../../../src/decompose-dynamic-import-vars';

test('Decompose specifier', async () => {
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