import dedent from 'dedent';
import { modLoBuiltinModCommonJsURL } from '../utils/mod-lo-builtin-mods';
import * as babel from '@babel/core';
import { cjsMetaUrlExportName, reservedIds } from './share';
import { collectRequiresVisitor } from '../transformer/babel/babel-plugins/collect-requires';

export const cjsWrapperImports = [modLoBuiltinModCommonJsURL] as const;

export function wrapCjs(
    exports: readonly string[],
    reexports: readonly string[],
) {
    return (context: typeof babel): babel.PluginObj => {
        return {
            visitor: {
                Program: {
                    exit: (path) => {
                        const requires: string[] = [];
                        context.traverse(path.node, collectRequiresVisitor(requires));
                        wrap(context, path, requires, exports, reexports);
                    },
                }
            },
        };
    };
}

function wrap(
    { types }: typeof babel,
    path: babel.NodePath<babel.types.Program>,
    requires: readonly string[],
    exports: readonly string[],
    reexports: readonly string[],
) {
    const originalProgram = path.node;
    const reqIds = requires.map((req) => path.scope.generateUid('req'));

    const filteredExports = exports.filter((exportName) => !reservedIds.includes(exportName));

    let cjsExportVarId = path.scope.generateUid('cjsExports');

    let declExportVars: babel.types.Statement[] = [];
    let updateExportVars: babel.types.Statement[] = [];
    let exportStatements: babel.types.Statement[] = [];

    if (filteredExports.length !== 0) {
        const exportVars = filteredExports.map((exportName) => {
            return [exportName, path.scope.generateUid(exportName)];
        });
    
        declExportVars = exportVars.map(([, localName]) =>
            types.variableDeclaration('let', [types.variableDeclarator(types.identifier(localName))]),
        );
    
        updateExportVars = exportVars.map(([exportName, localName]) => {
            return types.expressionStatement(types.assignmentExpression(
                '=',
                types.identifier(localName),
                types.memberExpression(
                    types.memberExpression(types.identifier('module'), types.identifier('exports')),
                    types.identifier(exportName),
                ),
            ));
        });
    
        exportStatements = [types.exportNamedDeclaration(
            undefined,
            exportVars.map(([exportName, localName]) =>
                types.exportSpecifier(types.identifier(localName), types.identifier(exportName))),
        )];
    }
    
    const program = template({
        cjsExportVar: types.identifier(cjsExportVarId),
        declCjsExportVar: types.variableDeclaration('let',
            [types.variableDeclarator(types.identifier(cjsExportVarId))]),
        declExportVars,
        updateExportVars,
        loaderVar: path.scope.generateUidIdentifier('loader'),
        requireVar: path.scope.generateUidIdentifier('require'),
        deps: requires.map((req, index) => types.importDeclaration([
            types.importSpecifier(types.identifier(reqIds[index]), types.identifier(cjsMetaUrlExportName)),
        ], types.stringLiteral(req))),
        resolveMap: types.objectExpression(requires.map((req, index) => types.objectProperty(
            types.stringLiteral(req),
            types.identifier(reqIds[index]),
        ))),
        cjsLoader: types.stringLiteral(modLoBuiltinModCommonJsURL),
        code: originalProgram.body,
        exports: exportStatements,
        cjsMetaUrlExportName: types.identifier(cjsMetaUrlExportName),
    });
    path.node.directives = [];
    path.node.body = [];
    path.pushContainer('directives', program.directives);
    path.pushContainer('body', program.body);
}

const template = babel.template.program(dedent`
    %%deps%%
    import %%loaderVar%% from %%cjsLoader%%;
    %%declCjsExportVar%%
    %%declExportVars%%
    %%loaderVar%%.define(import.meta.url, function (exports, %%requireVar%%, module, __filename, __dirname) {
        let require = %%loaderVar%%.createRequireWithReqMap(%%resolveMap%%, %%requireVar%%);
        (function () {
            %%code%%
        })();
        %%cjsExportVar%% = module.exports;
        %%updateExportVars%%
    });
    export { %%cjsExportVar%% as default }
    %%exports%%
    export const %%cjsMetaUrlExportName%% = import.meta.url;
`);

export async function getCjsInteropModuleSource(requestTarget: string) {
    return dedent`
        // I am the facade module who provides access to the CommonJS module '${requestTarget}'~
        import { ${cjsMetaUrlExportName} as req } from '${requestTarget}';
        import loader from '${modLoBuiltinModCommonJsURL}';
        if (!req) {
            loader.throwInvalidWrapper('${requestTarget}', import.meta.url);
        }
        loader.require(req);
        export * from '${requestTarget}';
        import { default as d } from '${requestTarget}'
        export { d as default };
    `;
}
