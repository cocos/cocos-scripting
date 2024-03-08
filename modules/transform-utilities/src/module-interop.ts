
import * as babel from '@babel/core';

export type ModuleInteropNodePath = 
    babel.NodePath<babel.types.ImportDeclaration> |
    babel.NodePath<babel.types.ExportAllDeclaration> |
    babel.NodePath<babel.types.ExportNamedDeclaration>;

export function makeVisitorOnModuleInteropASTs(fx: (path: ModuleInteropNodePath) => void): babel.Visitor {
    return {
        ImportDeclaration: fx,
        ExportAllDeclaration: fx,
        ExportNamedDeclaration: fx,
    };
}

export function makeVisitorOnModuleSpecifiers(fx: (path: babel.NodePath<babel.types.StringLiteral>) => void): babel.Visitor {
    return makeVisitorOnModuleInteropASTs((moduleInteropPath) => {
        if (moduleInteropPath.node.source) {
            return fx(moduleInteropPath.get('source') as babel.NodePath<babel.types.StringLiteral>);
        }
    });
}

export function getModuleSpecifiers(ast: babel.types.Node) {
    const dependencies: string[] = [];
    babel.traverse(ast, makeVisitorOnModuleInteropASTs((path) => {
        if (path.node.source) {
            dependencies.push(path.node.source.value);
        }
    }));
    return dependencies;
}

export function mapModuleSpecifiers(map: Record<string, string>): babel.PluginObj {
    return {
        visitor: makeVisitorOnModuleInteropASTs((path: ModuleInteropNodePath) => {
            if (path.node.source) {
                const source = path.node.source.value;
                if (source in map) {
                    (path.get('source') as babel.NodePath<babel.types.StringLiteral>).replaceWith(babel.types.stringLiteral(map[source]));
                }
            }
        }),
    };
}