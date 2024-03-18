
import type * as babel from '@babel/core';
import type { TemplateBuilderOptions } from '@babel/template';
import dedent from 'dedent';

function $({ template, types }: typeof babel): babel.PluginObj<{
    filename: string;
    opts: $.Options;
}> {
    const templateBuilderOptions: TemplateBuilderOptions = {
        preserveComments: true,
        // @ts-ignore
        syntacticPlaceholders: true,
    };

    const importTemplate = template.statement(
        `import { cclegacy as %%ccVar%% } from %%ccModule%%;`,
        templateBuilderOptions);

    const headerTemplate = template.statement(
        `%%ccVar%%._RF.push({}, %%compressedUUID%%, %%baseName%%, %%importMeta%%);`,
        templateBuilderOptions);

    const footerTemplate = template.statement(
        `%%ccVar%%._RF.pop();`, templateBuilderOptions);

    const hotTemplate = template.statement(dedent`
        import.meta.ccHot?.dispose(() => {
            const { js: {
                unregisterClass,
                _getClassById,
            } } = %%ccVar%%;
            const classConstructor = _getClassById(%%compressedUUID%%);
            if (classConstructor) {
                unregisterClass(classConstructor);
            }
        });
    `, templateBuilderOptions);


    return {
        visitor: {
            Program: (path, state) => {
                const options = state.opts;
                const ccVar = path.scope.generateUid('_cclegacy');
                const imp = importTemplate({
                    ccVar: types.identifier(ccVar),
                    ccModule: types.stringLiteral('cc'),
                });
                const header = headerTemplate({
                    ccVar: types.identifier(ccVar),
                    baseName: types.stringLiteral(options.baseName),
                    compressedUUID: types.stringLiteral(options.compressedUUID),
                    importMeta: options.importMeta ?
                        types.metaProperty(types.identifier('import'), types.identifier('meta')) :
                        types.identifier('undefined'),
                });
                const footer = footerTemplate({
                    ccVar: types.identifier(ccVar),
                });
                const disposeHandlerStatements: babel.types.Statement[] = !options.hot
                    ? []
                    : [hotTemplate({
                        ccVar: types.identifier(ccVar),
                        compressedUUID: types.stringLiteral(options.compressedUUID),
                    })];
                path.node.body = [imp, header].concat(path.node.body, [footer], disposeHandlerStatements);
            },
        },
    };
}

namespace $ {
    export interface Options {
        baseName: string;
        compressedUUID: string;
        importMeta?: boolean;
        hot?: boolean;
    }
}

export default $;
