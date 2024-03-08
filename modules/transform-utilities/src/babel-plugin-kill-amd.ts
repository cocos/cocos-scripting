import * as babel from '@babel/core';
import { TemplateBuilderOptions } from '@babel/template';

export default function killAmd(): babel.PluginObj {
    return {
        visitor: {
            Program: {
                exit (path) {
                    path.node.body = killAMDTemplate({
                        statements: path.node.body,
                    });
                },
            },
        },
    };
}

const killAMDTemplate = babel.template.statements(`
(function () {
    var define = undefined;
    (function () {
        %%statements%%
    })();
})();
`, {
    preserveComments: true,
    // @ts-ignore
    syntacticPlaceholders: true,
} as TemplateBuilderOptions);