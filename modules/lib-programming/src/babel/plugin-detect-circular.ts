
import type * as babel from '@babel/core';

export function $(
    { types, template, traverse }: typeof babel,
    options: $.Options,
): babel.PluginObj {
    if (!options || !options.reporter) {
        throw new Error(`'reporter' options is required.`);
    }

    const templateBuilderOptions: import('@babel/template').TemplateBuilderOptions = {
        preserveComments: true,
        // @ts-ignore
        syntacticPlaceholders: true,
    };

    const createReportFxTemplate = (
        observerFxName: string,
        observee: string,
        moduleRequest: string,
    ) => template.statements(`\
function ${observerFxName}(extras) {
    (%%reporterFx%%)("${observee}", "${moduleRequest}", import.meta, extras);
}`, Object.assign({}, templateBuilderOptions, {
        plugins: [
            'importMeta',
        ],
    }));

    const observedTemplate = template.expression(`\
(((%%condition%%) && (%%observee%% === (void 0))) ? (%%reportFxName%%({ error: Error() }), %%observee%%) : %%observee%%)
`, templateBuilderOptions);

    const isTypeUsedIdentifier = (id: babel.NodePath<babel.types.Identifier>): boolean => {
        // IS THIS GOOD??
        return id.parent.type.startsWith('TS');
    };

    return {
        name: 'detect-circular-reference',
        visitor: {
            Program: {
                enter: function (programPath): void {
                    handleProgram(programPath);
                },
            },
        },
    };

    function handleProgram(programPath: babel.NodePath<babel.types.Program>) {
        const crdId = programPath.scope.generateUid('_crd');
        programPath.node.body.unshift(types.variableDeclaration('let', [types.variableDeclarator(
            types.identifier(crdId), types.valueToNode(true))]));
        programPath.node.body.push(types.expressionStatement(types.assignmentExpression(
            '=', types.identifier(crdId), types.valueToNode(false))));
        const reporterNsName = programPath.scope.generateUid('_reporterNs');
        const reportFxs: babel.types.Statement[] = [];
        traverse(programPath.node, {
            ImportDeclaration: function (path) {
                handleImportDeclaration(programPath, path, crdId, reportFxs, reporterNsName);
            },
        });
        if (reportFxs.length !== 0) {
            programPath.node.body.unshift(types.importDeclaration(
                [types.importNamespaceSpecifier(types.identifier(reporterNsName))],
                types.stringLiteral(options.reporter.moduleName),
            ));
            programPath.node.body.push(...reportFxs);
        }
    }

    function handleImportDeclaration(
        programPath: babel.NodePath<babel.types.Program>,
        importDeclarationPath: babel.NodePath<babel.types.ImportDeclaration>,
        crdId: string,
        reportFxs: babel.types.Statement[],
        reporterNsName: string,
    ) {
        if (options!.moduleRequestFilter) {
            const tests = Array.isArray(options!.moduleRequestFilter) ? options!.moduleRequestFilter : [options!.moduleRequestFilter];
            if (tests.some((test) => importDeclarationPath.node.source.value.match(test))) {
                return;
            }
        }
        for (const specifier of importDeclarationPath.node.specifiers) {
            let local: string | undefined;
            if (types.isImportDefaultSpecifier(specifier)) {
                local = specifier.local.name;
            } else if (types.isImportNamespaceSpecifier(specifier)) {
                // TODO
            } else {
                local = specifier.local.name;
            }
            if (!local) {
                continue;
            }
            const binding = importDeclarationPath.scope.getBinding(local);
            if (binding && binding.referencePaths.length !== 0) {
                const reportFxName = programPath.scope.generateUid(`reportPossibleCrUseOf${local}`);
                reportFxs.push(...createReportFxTemplate(
                    reportFxName,
                    local,
                    importDeclarationPath.node.source.value,
                )({
                    reporterFx: types.memberExpression(
                        types.identifier(reporterNsName),
                        types.identifier(options.reporter.functionName),
                    ),
                }));
                for (const referencePath of binding.referencePaths) {
                    if (types.isIdentifier(referencePath.node) &&
                        !types.isExportSpecifier(referencePath.parent) &&
                        !types.isImportSpecifier(referencePath.parent) &&
                        !isTypeUsedIdentifier(referencePath as babel.NodePath<babel.types.Identifier>)) {
                        referencePath.replaceWith(observedTemplate({
                            reportFxName: types.identifier(reportFxName),
                            observee: types.identifier(local),
                            condition: types.identifier(crdId),
                        }));
                    }
                }
            }
        }
    }
}

export namespace $ {
    export interface Options {
        moduleRequestFilter?: RegExp | Array<RegExp>;
        reporter: {
            moduleName: string;
            functionName: string;
        };
    }
}

export default $;
