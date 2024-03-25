import * as babel from '@babel/core';
// @ts-ignore
import { declare } from '@babel/helper-plugin-utils';
import { genBabelPlugins } from './babel-plugins';

export { helpers } from './decorator-cc';

export const babelPresetCC = declare((api: any, options: babelPresetCC.Options): babel.PluginItem => {
    api.assertVersion(7);
    return {
        overrides: [{
            plugins: genBabelPlugins(options),
        }],
    }
});

export namespace babelPresetCC {
    export type Options = Partial<{
        /**
         * See `@babel/plugin-transform-typescript`.
         */
        allowDeclareFields: boolean;

        /**
         * See `@babel/plugin-transform-typescript`.
         */
        onlyRemoveTypeImports: boolean;

        /**
         * If true, `loose: true` is passed to `@babel/plugin-proposal-class-properties`.
         */
        useDefineForClassFields: boolean;

        /**
         * If it's 'external', then the helpers should be an external module.
         */
        ccDecoratorHelpers?: 'external' | 'inline';

         /**
          * The list of decorator names to be optimized.
          */
        fieldDecorators?: string[];

        /**
         * The list of decorator names to be removed, which should only work in Cocos Creator editor environment.
         */
        editorDecorators?: string[];
    }>;
}