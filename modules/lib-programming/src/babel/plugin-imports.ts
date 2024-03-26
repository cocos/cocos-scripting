
import type * as babel from '@babel/core';

export default function imports({ traverse }: typeof babel): babel.PluginObj<{
    opts: {
        imports: string[];
    };
}> {
    return {
        visitor: { Program: { exit: (path, state) => {
            const result: string[] = [];
            extract(traverse, path.node, result);
            state.opts.imports.push(...new Set(result));
        } } },
    };
}

function extract(traverse: typeof babel.traverse, node: babel.types.Node, result: string[]) {
    traverse(node, {
        ImportDeclaration: (p) => {
            result.push(p.node.source.value);
        },
        ExportNamedDeclaration: (p) => {
            if (p.node.source) {
                result.push(p.node.source.value);
            }
        },
        ExportAllDeclaration: (p) => {
            result.push(p.node.source.value);
        },
    });
}
