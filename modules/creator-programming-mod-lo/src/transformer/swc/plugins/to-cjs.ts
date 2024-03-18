
import * as swc from '@swc/core';
import Visitor from '@swc/core/Visitor';
import { CjsInfo } from '../../../cjs/detect';
import { cjsMetaUrlExportName, reservedIds } from '../../../cjs/share';
import { modLoBuiltinModCommonJsURL } from '../../../utils/mod-lo-builtin-mods';
import * as babelTypes from '@babel/types';
import { RequiresCollector } from './requires-collector';
import { CjsExportsInfo } from '../../../cjs/detect-exports';

const dummySpan: swc.Span = { start: 0, end: 0, ctxt: 0, };

export class ToCjs extends Visitor {
    constructor(cjsExportsInfo: CjsExportsInfo) {
        super();
        this._cjsExportsInfo = cjsExportsInfo;
    }

    public visitProgram(program: swc.Program): swc.Program {
        const requiresCollector = new RequiresCollector();
        const foo = requiresCollector.visitProgram(program);
        const bar = this.doVisitProgram(foo, requiresCollector.requires);
        return bar;
    }

    private doVisitProgram(program: swc.Program, requires: string[]): swc.Program {
        // if (program.type !== 'Script') {
        //     throw new Error(`Expect input swc source to be script but actually being module.`);
        // }

        const cjsStatements = (program as swc.Script).body;

        const { _cjsExportsInfo: cjsExportsInfo } = this;

        // TODO
        const generateUid = (name: string) => {
            const id = babelTypes.toIdentifier(name);
            const uid = id.replace(/^_+/, "").replace(/[0-9]+$/g, "");
            const foo = `_${uid}`;
            return foo;
        };

        const reqIds: string[] = requires.map(generateUid);

        const requireVarId = 'require';

        const filteredExports = cjsExportsInfo.exports.filter((exportName) => !reservedIds.includes(exportName));

        const exportVarEntries = filteredExports.map((exportName) => {
            return [exportName, generateUid(exportName)] as [string, string];
        });

        const deps: swc.ImportDeclaration[] = requires.map((request, requestIndex) => createImportDeclaration(
            createStringLiteral(request),
            [{
                type: 'ImportSpecifier',
                span: dummySpan,
                imported: createIdentifier(cjsMetaUrlExportName),
                local: createIdentifier(reqIds[requestIndex]),
            }]
        ));

        const loaderVarIdString = generateUid('loader');
        const cjsExportVarId = generateUid('cjsExports');

        const importLoaderStmt: swc.ImportDeclaration = createImportDeclaration(
            createStringLiteral(modLoBuiltinModCommonJsURL),
            [{
                type: 'ImportDefaultSpecifier',
                span: dummySpan,
                local: createIdentifier(loaderVarIdString),
            }],
        );

        const resolveMap: swc.ObjectExpression = {
            type: 'ObjectExpression',
            span: dummySpan,
            properties: requires.map((request, requestIndex): swc.Property => {
                return {
                    type: 'KeyValueProperty',
                    key: createStringLiteral(request),
                    value: createIdentifier(reqIds[requestIndex]),
                };
            }),
        };

        const declCjsExportVar = createVariableDeclaration(
            'let',
            [createVariableDeclarator(
                createIdentifier(cjsExportVarId),
            )],
        );

        const declExportVars = exportVarEntries.map(([, localName]): swc.VariableDeclaration => {
            return {
                type: 'VariableDeclaration',
                span: dummySpan,
                kind: 'let',
                declare: false,
                declarations: [{
                    type: 'VariableDeclarator',
                    span: dummySpan,
                    id: createIdentifier(localName),
                    definite: false,
                }],
            };
        });

        const updateExportVars = exportVarEntries.map(([exportName, localName]): swc.ExpressionStatement => {
            return {
                type: 'ExpressionStatement',
                span: dummySpan,
                expression: {
                    type: 'AssignmentExpression',
                    span: dummySpan,
                    operator: '=',
                    left: createIdentifier(localName),
                    right: createMemberExpression(
                        createMemberExpression(
                            createIdentifier('module'),
                            createIdentifier('exports'),
                        ),
                        createIdentifier(exportName),
                    ),
                },
            };
        });

        const exportStatements: swc.ModuleItem[] = [createExportNamedDeclaration(
            exportVarEntries.map(([exportName, localName]): swc.ExportSpecifier => {
                return {
                    type: 'ExportSpecifier',
                    span: dummySpan,
                    orig: createIdentifier(exportName),
                    exported: createIdentifier(localName),
                };
            })
        )];

        const exportCjsExportsAsDefault: swc.ExportNamedDeclaration = createExportNamedDeclaration(
            [{
                type: 'ExportSpecifier',
                span: dummySpan,
                orig: createIdentifier(cjsExportVarId),
                exported: createIdentifier('default'),
            }],
        );

        const exportCjsMetaURL: swc.ExportDeclaration = {
            type: 'ExportDeclaration',
            span: dummySpan,
            declaration: {
                type: 'VariableDeclaration',
                span: dummySpan,
                declare: false,
                kind: 'const',
                declarations: [{
                    type: 'VariableDeclarator',
                    span: dummySpan,
                    definite: false,
                    id: createIdentifier(cjsMetaUrlExportName),
                    init: createImportMetaURLExpression(),
                }],
            },
        };

        return {
            type: 'Module',
            span: dummySpan,
            interpreter: undefined as unknown as string, // TODO
            body: [
                ...deps,
                importLoaderStmt,
                declCjsExportVar,
                ...declExportVars,
                createLoaderVarDefineStatement(),
                ...exportStatements,
                exportCjsExportsAsDefault,
                exportCjsMetaURL,
            ],
        };

        function createLoaderVarDefineStatement() {
            const params: swc.Param[] = [
                'exports',
                requireVarId,
                'module',
                '__filename',
                '__dirname'
            ].map((id) => ({
                type: 'Parameter',
                span: dummySpan,
                pat: createIdentifier(id), 
            }));

            const declareRequire = createVariableDeclaration(
                'let',
                [createVariableDeclarator(
                    createIdentifier('require'),
                    createCallExpression(
                        createMemberExpression(
                            createIdentifier(loaderVarIdString),
                            createIdentifier('createRequireWithReqMap'),
                        ),
                        [
                            resolveMap,
                            createIdentifier(requireVarId),
                        ],
                    ),
                )],
            );

            const executeCjsCode: swc.Statement = {
                type: 'ExpressionStatement',
                span: dummySpan,
                expression: createCallExpression(
                    createPlainFunctionExpression(
                        createIdentifier('__execute_cjs__'),
                        [],
                        cjsStatements,
                    ),
                    [],
                ),
            };

            const setCjsExportVar: swc.Statement = {
                type: 'ExpressionStatement',
                span: dummySpan,
                expression: {
                    type: 'AssignmentExpression',
                    span: dummySpan,
                    operator: '=',
                    left: createIdentifier(cjsExportVarId),
                    right: createMemberExpression(
                        createIdentifier('module'),
                        createIdentifier('exports'),
                    ),
                },
            };

            const registerFnStatements: swc.Statement[] = [
                declareRequire,
                executeCjsCode,
                setCjsExportVar,
                ...updateExportVars,
            ];

            const registerFn = createPlainFunctionExpression(
                createIdentifier('__execute_cjs__'),
                params,
                registerFnStatements,
            );

            const loaderDefine: swc.Statement = {
                type: 'ExpressionStatement',
                'span': dummySpan,
                expression: {
                    type: 'CallExpression',
                    span: dummySpan,
                    'callee': {
                        'type': 'MemberExpression',
                        span: dummySpan,
                        'computed': false,
                        'object': createIdentifier(loaderVarIdString),
                        'property': createIdentifier('define'),
                    },
                    'arguments': [{
                        expression: createImportMetaURLExpression(),
                    }, {
                        expression: registerFn,
                    }],
                },
            };

            return loaderDefine;
        }
    }

    private _cjsExportsInfo: CjsExportsInfo;
}

function createIdentifier(value: string): swc.Identifier {
    return {
        type: 'Identifier',
        span: dummySpan,
        value,
        optional: false,
    };
}

function createStringLiteral(value: string): swc.StringLiteral {
    return {
        type: 'StringLiteral',
        value,
        span: dummySpan,
        has_escape: false,
    };
}

function createImportMetaExpression(): swc.MetaProperty {
    return {
        type: 'MetaProperty',
        meta: createIdentifier('import'),
        property: createIdentifier('meta'),
    };
}

function createImportMetaURLExpression (): swc.MemberExpression {
    return createMemberExpression(
        createImportMetaExpression(),
        createIdentifier('url'),
        false,
    );
}

function createVariableDeclaration(
    kind: swc.VariableDeclarationKind,
    declarations: swc.VariableDeclarator[],
): swc.VariableDeclaration {
    return {
        type: 'VariableDeclaration',
        span: dummySpan,
        declare: false,
        kind,
        declarations,
    };
}

function createVariableDeclarator(id: swc.Identifier, init?: swc.Expression): swc.VariableDeclarator {
    return {
        type: 'VariableDeclarator',
        span: dummySpan,
        definite: false,
        id,
        init,
    };
}

function createCallExpression(callee: swc.Expression, args: swc.Expression[]): swc.CallExpression {
    return {
        type: 'CallExpression',
        span: dummySpan,
        callee,
        arguments: args.map((expression) => ({ expression })),
    };
}

function createMemberExpression(object: swc.Expression, property: swc.Expression, computed = false): swc.MemberExpression {
    return {
        type: 'MemberExpression',
        span: dummySpan,
        object,
        property,
        computed,
    };
}

function createPlainFunctionExpression(id: swc.Identifier, params: swc.Param[], bodyStatementsStatements: swc.Statement[]): swc.FunctionExpression {
    return {
        type: 'FunctionExpression',
        span: dummySpan,
        async: false,
        generator: false,
        identifier: id,
        params,
        body: {
            type: 'BlockStatement',
            span: dummySpan,
            stmts: bodyStatementsStatements,
        },
    };
}

function createImportDeclaration(source: swc.StringLiteral, specifiers: swc.ImportSpecifier[], typeOnly = false): swc.ImportDeclaration {
    return {
        type: 'ImportDeclaration',
        span: dummySpan,
        source,
        specifiers,
        typeOnly,
    } as swc.ImportDeclaration;
}

function createExportNamedDeclaration(
    specifiers: swc.ExportSpecifier[],
    source: swc.StringLiteral | undefined = undefined,
    typeOnly = false,
): swc.ExportNamedDeclaration {
    return {
        type: 'ExportNamedDeclaration',
        span: dummySpan,
        specifiers,
        source,
        typeOnly,
    } as swc.ExportNamedDeclaration;
}
