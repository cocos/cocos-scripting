import { PluginPass, template } from "@babel/core";
import * as t from '@babel/types';
import generate from "@babel/generator";
import { CC_HELPER_GENERATOR, CC_HELPER_IMPORT_GENERATOR } from "./constants";

type HelperBuilder = (replacement: {NAME: t.StringLiteral}) => t.ExpressionStatement;
const initializeFieldBuilder = template(`function %%NAME%% (target, property, initializer) {
    if (!initializer) return;
    target[property]=initializer();
}`) as HelperBuilder;
const applyDecoratedInitializerBuilder = template(`function %%NAME%% (target, property, decorators, initializer) {
    return decorators.slice().reverse().reduce(function (decoratedInitializer, decorator) {
      return decorator(target, property, decoratedInitializer) || decoratedInitializer;
    }, initializer);
  }`) as HelperBuilder;

const helpers: Record<string, t.Statement> = {};
function registerHelperBuilder (helperName: string, statement: any) {  // TODO: specify type of statement
    helpers[helperName] = statement;
}
registerHelperBuilder('initializeField', initializeFieldBuilder);
registerHelperBuilder('applyDecoratedInitializer', applyDecoratedInitializerBuilder);

export const CC_HELPER_MODULE = 'CC_HELPER_MODULE';

export function generateHelperModuleSource () {
    let result = '';
    for (let helperName in helpers) {
        const helperBuilder = getHelperBuilder(helperName);
        const helper = helperBuilder({NAME: t.identifier(helperName)});
        const { code } = generate(t.exportNamedDeclaration(helper));
        result += code + '\n';
    }
    return result;
}

export function getHelperBuilder (helperName: string): any {
    const helperBuilder = helpers[helperName];
    if (!helperBuilder) {
        throw new Error(`Unknown custom helper: ${helperName}`);
    }
    return helperBuilder;
}

export function addHelper (state: PluginPass, helperName: string) {
    // @ts-ignore get should have been defined in BabelFile
    const importGenerator = state.file.get(CC_HELPER_IMPORT_GENERATOR);
    if (importGenerator) {
        return importGenerator(helperName);
    }
    // @ts-ignore get should have been defined in BabelFile
    const helperGenerator = state.file.get(CC_HELPER_GENERATOR);
    if (helperGenerator) {
        return helperGenerator(helperName);
    }
    throw new Error(`No available helper: ${helperName}`);
}

