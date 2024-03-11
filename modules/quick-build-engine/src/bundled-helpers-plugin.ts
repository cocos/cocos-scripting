
// eslint-disable-next-line import/no-extraneous-dependencies
import { addNamed } from '@babel/helper-module-imports';
import * as babel from '@babel/core';

export function importHelperPlugin(): babel.PluginObj<{
    opts: {
        helperModuleName: string;
    },
}> {
    return {
        visitor: {},
        pre(file: babel.BabelFile): void {
            const cachedHelpers: Record<string, babel.types.Identifier> = {};
            // @ts-expect-error TODO(cjh): type error?
            file.set('helperGenerator', (name: string) => {
                // @ts-expect-error TODO(cjh): type error?
                if (!file.availableHelper(name)) {
                    return null;
                }
                if (cachedHelpers[name]) {
                    return cachedHelpers[name];
                }
                return (cachedHelpers[name] = addNamed(file.path, name, this.opts.helperModuleName));
            });
        },
    };
}
