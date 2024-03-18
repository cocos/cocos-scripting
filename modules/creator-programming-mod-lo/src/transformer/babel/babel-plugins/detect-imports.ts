
import * as babel from '@babel/core';
import { Specifier } from '../../../mods';

interface LineColumn {
    line: number;
    column: number;
}

interface SourceLocation {
    start: LineColumn;
    end: LineColumn;
}

export function createBabelPluginDetectAndRewriteImports({
    rewrite,
    specifiers,
}: {
    rewrite?: (specifier: string) => string | undefined;
    specifiers: Specifier[];
}) {
    const add = (specifier: string, loc?: babel.types.SourceLocation | null) => {
        const resolved = rewrite?.(specifier);
        specifiers.push({
            value: specifier,
            resolved,
            loc: loc ? {
                start: { line: loc.start.line, column: loc.start.column },
                end: { line: loc.end.line, column: loc.end.column },
            } : undefined,
        });
        return resolved;
    };
    const addStringLiteralSpecifier = (specifier: babel.types.StringLiteral) => {
        return add(specifier.value, specifier.loc);
    };
    const createRewrittenStringLiteralSpecifier = (value: string, original: string) => {
        const stringLiteral = babel.types.stringLiteral(value);
        babel.types.addComment(stringLiteral, 'trailing', original);
        return stringLiteral;
    };
    return {
        visitor: visitImportSpecifiers({
            stringLiteral(path) {
                const rewritten = addStringLiteralSpecifier(path.node);
                if (rewritten) {
                    path.replaceWith(createRewrittenStringLiteralSpecifier(rewritten, path.node.value));
                }
            },
            simpleTemplateLiteral(path, raw) {
                const rewritten = add(raw, path.node.loc);
                if (rewritten) {
                    path.replaceWith(createRewrittenStringLiteralSpecifier(rewritten, raw));
                }
            },
        }),
    };
}

export async function detectImports(ast: babel.types.Program | babel.types.File): Promise<Specifier[]> {
    const result: Specifier[] = [];
    const add = (specifier: string, loc?: babel.types.SourceLocation | null) => {
        result.push({
            value: specifier,
            loc: loc ? {
                start: { line: loc.start.line, column: loc.start.column },
                end: { line: loc.end.line, column: loc.end.column },
            } : undefined,
        });
    };
    const addStringLiteralSpecifier = (specifier: babel.types.StringLiteral) => {
        add(specifier.value, specifier.loc);
    };
    babel.traverse(ast, visitImportSpecifiers({
        stringLiteral(path) {
            addStringLiteralSpecifier(path.node);
        },
        simpleTemplateLiteral(path, raw) {
            add(raw, path.node.loc);
        },
    }));
    return result;
}

interface ImportSpecifierVisitor {
    stringLiteral(path: babel.NodePath<babel.types.StringLiteral>): void;

    simpleTemplateLiteral(path: babel.NodePath<babel.types.TemplateLiteral>, value: string): void;
}

function visitImportSpecifiers<S>(visitor: ImportSpecifierVisitor): babel.Visitor<S> {
    return {
        ImportDeclaration: (path) => visitor.stringLiteral(path.get('source')),
        ExportAllDeclaration: (path) => visitor.stringLiteral(path.get('source')),
        ExportNamedDeclaration: (path) => {
            if (path.node.source) {
                visitor.stringLiteral(path.get('source') as babel.NodePath<babel.types.StringLiteral>);
            }
        },
        CallExpression: (path) => {
            const { callee, arguments: args } = path.node;
            if (callee.type === 'Import' && args.length === 1) {
                const specifierNode = args[0];
                if (specifierNode.type === 'StringLiteral') {
                    visitor.stringLiteral(path.get('arguments')[0] as babel.NodePath<babel.types.StringLiteral>);
                } else if (
                    specifierNode.type === 'TemplateLiteral' &&
                    specifierNode.expressions.length === 0 &&
                    specifierNode.quasis.length === 1) {
                    visitor.simpleTemplateLiteral(
                        path.get('arguments')[0] as babel.NodePath<babel.types.TemplateLiteral>,
                        specifierNode.quasis[0].value.raw,
                    );
                }
            }
        },
    };
}
