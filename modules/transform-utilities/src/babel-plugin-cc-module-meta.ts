
import * as babel from '@babel/core';
import { TemplateBuilderOptions } from '@babel/template';

function $($babel: typeof babel, options?: $.Options): babel.PluginObj<{filename: string}> {
    if (typeof options === 'undefined') {
        throw new Error(`Options are required.`);
    }

    const templateBuilderOptions: TemplateBuilderOptions = {
        preserveComments: true,
        // @ts-ignore
        syntacticPlaceholders: true,
    };

    const importTemplate = babel.template.statement(
        `import { cclegacy as %%ccVar%% } from %%ccModule%%;`,
        templateBuilderOptions);

    const headerTemplate = babel.template.statement(
        `%%ccVar%%._RF.push({}, %%compressedUUID%%, %%baseName%%, %%importMeta%%);`,
        templateBuilderOptions);

    const footerTemplate = babel.template.statement(
        `%%ccVar%%._RF.pop();`, templateBuilderOptions);

    return {
        visitor: {
            Program: (path, state) => {
                const meta = typeof (options.meta) === 'function' ?
                options.meta(state.filename) : options.meta;
                if (!meta) {
                    return;
                }
                const ccVar = path.scope.generateUid('_cclegacy');
                const imp = importTemplate({
                    ccVar: babel.types.identifier(ccVar),
                    ccModule: babel.types.stringLiteral('cc'),
                });
                const header = headerTemplate({
                    ccVar: babel.types.identifier(ccVar),
                    baseName: babel.types.stringLiteral(meta.baseName),
                    compressedUUID: babel.types.stringLiteral(meta.compressedUUID),
                    importMeta: options.importMeta ?
                        babel.types.metaProperty(babel.types.identifier('import'), babel.types.identifier('meta')) :
                        babel.types.identifier('undefined'),
                });
                const footer = footerTemplate({
                    ccVar: babel.types.identifier(ccVar),
                });
                path.node.body = [imp, header].concat(path.node.body, [footer]);
            },
        },
    };
}

namespace $ {
    export interface ModuleMeta {
        baseName: string;
        compressedUUID: string;
    }

    export interface Options {
        meta: ModuleMeta | ((fileName: string) => ModuleMeta | null);
        importMeta?: boolean;
    }
}

export default $;
