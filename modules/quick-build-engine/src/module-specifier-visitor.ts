
export function makeVisitorOnModuleSpecifiers(fx: (path: babel.NodePath<babel.types.StringLiteral>) => void): babel.Visitor {
    type StringLiteralPath = babel.NodePath<babel.types.StringLiteral>;
    return {
        ImportDeclaration: (path) => fx(path.get('source')),
        ExportAllDeclaration: (path) => fx(path.get('source')),
        ExportNamedDeclaration: (path) => {
            const source = path.get('source');
            if (source.node !== null) {
                fx(source as StringLiteralPath);
            }
        },
        CallExpression: (path) => {
            const { node } = path;
            if (node.callee.type === 'Import' &&
                node.arguments.length === 1 &&
                node.arguments[0].type === 'StringLiteral') {
                fx(path.get('arguments')[0] as StringLiteralPath);
            }
        },
    };
}
