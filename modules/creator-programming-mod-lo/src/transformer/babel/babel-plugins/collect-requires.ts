import * as babel from '@babel/core';

export function collectRequires(ast: babel.types.Node) {
    const requires: string[] = [];
    babel.traverse(ast, collectRequiresVisitor(requires));
    return requires;
}

export function collectRequiresVisitor(requires: string[]): babel.Visitor {
    return {
        CallExpression: (path) => {
            const { node } = path;
            if (babel.types.isIdentifier(node.callee) &&
                node.callee.name === 'require' &&
                node.arguments.length === 1 &&
                babel.types.isStringLiteral(node.arguments[0])) {
                requires.push(node.arguments[0].value);
            }
        },
    };
}
