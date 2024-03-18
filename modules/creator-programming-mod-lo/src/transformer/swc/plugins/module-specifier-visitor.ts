
import * as swc from '@swc/core';
import Visitor from '@swc/core/Visitor';

export class ModuleSpecifierVisitor extends Visitor {
    public visitImportDeclaration(node: swc.ImportDeclaration): swc.ImportDeclaration {
        this.doVisitModuleSpecifier(node.source);
        return node;
    }

    public visitExportAllDeclaration(node: swc.ExportAllDeclaration): swc.ExportAllDeclaration {
        this.doVisitModuleSpecifier(node.source);
        return node;
    }

    public visitExportNamedDeclaration(node: swc.ExportNamedDeclaration): swc.ExportNamedDeclaration {
        if (node.source) {
            this.doVisitModuleSpecifier(node.source);
        }
        return node;
    }

    public visitCallExpression(node: swc.CallExpression): swc.CallExpression {
        if (node.callee.type === 'PrivateName' && node.callee.id.value === 'import' && node.arguments.length > 1) {
            // import()
            const specifierNode = node.arguments[0];
            if (!specifierNode.spread) {
                if (specifierNode.expression.type === 'StringLiteral') {
                    this.doVisitModuleSpecifier(specifierNode.expression);
                } else if (
                    specifierNode.expression.type === 'TemplateLiteral' &&
                    specifierNode.expression.expressions.length === 0 &&
                    specifierNode.expression.quasis.length === 1
                ) {
                    const quasi = specifierNode.expression.quasis[0];
                    this.doVisitModuleSpecifier(quasi.raw);
                }
            }
        }
        return node;
    }

    protected doVisitModuleSpecifier(stringLiteral: swc.StringLiteral) {

    }
}

