import type * as babel from '@babel/core';
import { addNamed } from '@babel/helper-module-imports';

export default function importHelper({
    helperModule,
}: {
    helperModule: string;
}) {
    type State = {
        set(name: 'helperGenerator', callback: (name: string) => void): void;
        availableHelper(name: string): boolean;
        opts: {
            imports: string[];
        };
    };
    return ({ types }: typeof babel): babel.PluginObj<State & babel.PluginPass> => {
        return {
            visitor: {},
            pre(state: babel.BabelFile & State) {
                const cachedHelpers: Record<string, babel.types.Node> = {};
                state.set('helperGenerator', (name) => {
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
    }
}