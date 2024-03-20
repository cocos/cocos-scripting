// @ts-ignore
import pluginTransformTypeScript from '@babel/plugin-transform-typescript';
// @ts-ignore
import pluginConstEnum from 'babel-plugin-const-enum';
import { pluginDecoratorCC } from './decorator-cc';
// @ts-ignore
import pluginClassProperties from '@babel/plugin-proposal-class-properties';
// @ts-ignore
import pluginNullishCoalescingOperator from '@babel/plugin-proposal-nullish-coalescing-operator';
// @ts-ignore
import pluginOptionalChaining from '@babel/plugin-proposal-optional-chaining';
// @ts-ignore
import pluginLogicalAssignmentOperators from '@babel/plugin-proposal-logical-assignment-operators';
import type { babelPresetCC } from './index' 

export function genBabelPlugins ({
    allowDeclareFields,
    onlyRemoveTypeImports,
    useDefineForClassFields,
    ccDecoratorHelpers,
    fieldDecorators,
    editorDecorators,
}: babelPresetCC.Options) {
    const looseClassProperties = !useDefineForClassFields;

    // Note, if we choose to use @babel/preset-typescript instead of @babel/plugin-transform-typescript
    // We have to wrap the `plugins` into an anonymous preset and that preset should
    // be placed prior to @babel/preset-typescript.
    // Otherwise, the @babel/proposal-class-properties would execute before @babel/plugin-transform-typescript.
    // The result would be, unexpectly, even if we pass `loose: true` && `allowDeclareFields: false`
    // to @babel/preset-typescript, class fields with no explicit initializer was still not intent to be erased.
    // This behaviour does not match what tsc does as tsconfig `useDefineForClassFields` enabled.
    return [
        // TS const enum
        [pluginConstEnum, {
            transform: 'constObject'
        }],

        [pluginTransformTypeScript, {
            allowNamespaces: true,
            allowDeclareFields,
            onlyRemoveTypeImports,
        }],

        [pluginDecoratorCC, {
            version: 'legacy',
            helpers: ccDecoratorHelpers,
            fieldDecorators,
            editorDecorators,
        } as pluginDecoratorCC.Options],

        [pluginClassProperties, {
            loose: looseClassProperties,
        }],

        // ?? operator
        pluginNullishCoalescingOperator,

        // ?. operator
        pluginOptionalChaining,

        // ||= &&=
        pluginLogicalAssignmentOperators,
    ]
}