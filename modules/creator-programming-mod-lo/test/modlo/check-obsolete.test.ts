import { transformSync } from '@babel/core';
import { pluginCheckObsolete } from '../../src/transformer/babel/babel-plugins/plugin-check-obsolete';

test('import from cc', () => {
    const testCode = `
    import { SystemEventType, ButtonComponent as A, EPSILON } from 'cc';
    import { ButtonComponent as B } from 'cc';
    import { Button as C } from 'cc';
    import * as cc_namespace_test from 'cc';
    import * as another_cc_namespace_test from 'cc';

    console.log(cc_namespace_test.ButtonComponent);
    console.log(another_cc_namespace_test.SystemEventType);
    console.log(A, B, C);
    `
    const result = transformSync(testCode, {
        code: true,
        sourceType: 'module',
        plugins: [pluginCheckObsolete],
    });
    expect(result?.code).toMatchInlineSnapshot(`
"import { __checkObsolete__, __checkObsoleteInNamespace__ } from 'cc';
import { SystemEventType, ButtonComponent as A, EPSILON } from 'cc';
__checkObsolete__(['SystemEventType', 'ButtonComponent', 'EPSILON']);
import { ButtonComponent as B } from 'cc';
__checkObsolete__(['ButtonComponent']);
import { Button as C } from 'cc';
__checkObsolete__(['Button']);
import * as _cc_namespace_test from 'cc';
const cc_namespace_test = __checkObsoleteInNamespace__(_cc_namespace_test);
import * as _another_cc_namespace_test from 'cc';
const another_cc_namespace_test = __checkObsoleteInNamespace__(_another_cc_namespace_test);
console.log(cc_namespace_test.ButtonComponent);
console.log(another_cc_namespace_test.SystemEventType);
console.log(A, B, C);"
`);
});

test('import from other module', () => {
    const testCode = `
    import { foo } from 'bar';

    console.log(foo);
    `
    const result = transformSync(testCode, {
        code: true,
        sourceType: 'module',
        plugins: [pluginCheckObsolete],
    });
    expect(result?.code).toMatchInlineSnapshot(`
"import { foo } from 'bar';
console.log(foo);"
`);
});

test('import from both cc and other module', () => {
    const testCode = `
    import { SystemEventType, ButtonComponent as A } from 'cc';
    import { foo } from 'bar';

    console.log(SystemEventType, ButtonComponent, foo);
    `
    const result = transformSync(testCode, {
        code: true,
        sourceType: 'module',
        plugins: [pluginCheckObsolete],
    });
    expect(result?.code).toMatchInlineSnapshot(`
"import { __checkObsolete__, __checkObsoleteInNamespace__ } from 'cc';
import { SystemEventType, ButtonComponent as A } from 'cc';
__checkObsolete__(['SystemEventType', 'ButtonComponent']);
import { foo } from 'bar';
console.log(SystemEventType, ButtonComponent, foo);"
`);
});
