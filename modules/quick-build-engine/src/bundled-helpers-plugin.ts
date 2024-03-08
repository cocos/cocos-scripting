
// @ts-ignore
import { addNamed } from '@babel/helper-module-imports';
import * as babel from '@babel/core';

export function importHelperPlugin(): babel.PluginObj<{
    opts: {
        helperModuleName: string;
    },
}> {
    return {
        visitor: {},
        pre(file) {
            const cachedHelpers: Record<string, babel.types.Identifier> = {};
            // @ts-ignore
            file.set('helperGenerator', (name: string) => {
                // @ts-ignore
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
