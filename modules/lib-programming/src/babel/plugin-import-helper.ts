import type * as babel from '@babel/core';
import { addNamed } from '@babel/helper-module-imports';

export default function importHelper({
    helperModule,
}: {
    helperModule: string;
}) {
    return ({ types }: typeof babel): babel.PluginObj<{
        set(name: 'helperGenerator', callback: (name: string) => void): void;
        availableHelper(name: string): boolean;
        opts: {
            imports: string[];
        };
    } & babel.PluginPass> => {
        return {
            visitor: {},
            pre(state) {
                const cachedHelpers: Record<string, babel.types.Node> = {};
                // @ts-ignore
                state.set('helperGenerator', (name) => {
                  // @ts-ignore
                  if (!state.availableHelper(name)) {
                    return null;
                  }
          
                  if (cachedHelpers[name]) {
                    return types.cloneNode(cachedHelpers[name]);
                  }
          
                  // @ts-ignore
                  const path: babel.types.Node = state.path;
                  return (cachedHelpers[name] = addNamed(path, name, helperModule));
                });
            },
        };
    };
}