import { PluginObj, types, template } from '@babel/core';

const templateOption = {
    syntacticPlaceholders: true,
};

export const pluginCheckObsolete: PluginObj = {
    visitor: {
        Program (path) {
            let needImportHelper = false;
            path.traverse({
                ImportDeclaration (path) {
                    if (path.node.source.value !== 'cc') {
                        return;
                    }
                    needImportHelper = true;
                    if (path.node.specifiers[0].type === 'ImportNamespaceSpecifier') {
                        // handle namespace import
                        const importSpecifier = path.node.specifiers[0];
                        const localName = importSpecifier.local.name;
                        const newLocalName = path.scope.generateUid(localName);
                        path.replaceWith(template.statement(`import * as ${newLocalName} from 'cc';`, templateOption)());
                        path.insertAfter(template.statement(`const ${localName} = __checkObsoleteInNamespace__(${newLocalName});`, templateOption)());
                        path.skip();
                    } else {
                        const imported: string[] = [];
                        path.traverse({
                            ImportSpecifier (path) {
                                imported.push(`'${(<types.Identifier>path.node.imported).name}'`);
                            },
                        });
                        if (imported.length > 0) {
                            const checkObsoleteStatement = template.statement(`__checkObsolete__([${imported.join(', ')}]);`, templateOption)();
                            path.insertAfter(checkObsoleteStatement);
                        }
                    }
            }});
            
            // insert import helper statement
            if (needImportHelper) {
                const importCheckObsolete = template.statement(`import { __checkObsolete__, __checkObsoleteInNamespace__ } from 'cc';`, templateOption)();
                path.node.body = [importCheckObsolete].concat(path.node.body);
            }
        },
    }
}