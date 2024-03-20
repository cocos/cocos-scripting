import { BabelFile, types as t } from "@babel/core";
// @ts-ignore
import syntaxDecorators from '@babel/plugin-syntax-decorators';
// @ts-ignore
import { addNamed } from '@babel/helper-module-imports'
import { CC_HELPER_GENERATOR, CC_HELPER_IMPORT_GENERATOR } from "./constants";
// @ts-ignore
import { declare } from "@babel/helper-plugin-utils";
import { getHelperBuilder, CC_HELPER_MODULE } from "./helpers";
import { genVisitor } from './legacy-visitor';


export namespace pluginDecoratorCC {
   export interface Options {
     // NOTE：for now, only 'legacy' is supported.
     version?: "legacy" | "2018-09" | "2021-12" | "2022-03";
     helpers: "external" | "inline";
     fieldDecorators?: string[];
     editorDecorators?: string[];
   }
}


export const pluginDecoratorCC = declare((api: babel.ConfigAPI, options: pluginDecoratorCC.Options) => {
  api.assertVersion(7);
  if (options.version !== 'legacy') {
    throw new Error('please specify the decorator proposal version as legacy');
  }
  if (!options.fieldDecorators) {
    throw new Error('please specify the array of field decorators');
  }
  return {
    name: 'plugin-decorator-cc',
    inherits: syntaxDecorators,
    pre (file: BabelFile) {
      if (options.helpers === 'external') {
        const importHelperCache: Record<string, any> = {};
        // @ts-ignore get should have been defined in BabelFile
        file.set(CC_HELPER_IMPORT_GENERATOR, (name: string) => {
          if (importHelperCache[name]) {
            return t.cloneNode(importHelperCache[name]);
          }

          // @ts-ignore
          return importHelperCache[name] = addNamed(file.path, name, CC_HELPER_MODULE);
        });
      }
  
      const helperCache: Record<string, any> = {};
      // @ts-ignore get should have been defined in BabelFile
      file.set(CC_HELPER_GENERATOR, (name: string) => {
        if (helperCache[name]) {
          return t.cloneNode(helperCache[name]);
        }
  
        // @ts-ignore
        const helperUID = file.scope.generateUidIdentifier(name);
        const helperBuilder = getHelperBuilder(name);
        const helper = helperBuilder({NAME: helperUID});
        file.path.node.body = [helper].concat(file.path.node.body);
        return helperCache[name] = helperUID;
      });
    },

    visitor: genVisitor(options.fieldDecorators, options.editorDecorators),

    post (file: BabelFile) {
      // @ts-ignore get should have been defined in BabelFile
      file.set(CC_HELPER_GENERATOR, undefined);
      // @ts-ignore get should have been defined in BabelFile
      file.set(CC_HELPER_IMPORT_GENERATOR, undefined);
    }
  } as babel.PluginItem;
});
