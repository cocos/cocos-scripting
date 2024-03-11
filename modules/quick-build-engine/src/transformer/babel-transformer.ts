import { ScriptTargets, Transformer, TransformOptions, TransformResult } from './transformer';
import * as babel from '@babel/core';
import babelPresetEnv from '@babel/preset-env';

// @ts-expect-error TODO(cjh): Where to find the type?
import babelPluginConstEnum from 'babel-plugin-const-enum';
// @ts-expect-error TODO(cjh): Where to find the type?
import babelPluginTransformModulesUmd from '@babel/plugin-transform-modules-umd';
// @ts-expect-error TODO(cjh): Where to find the type?
import babelPluginTransformModulesSystemJs from '@babel/plugin-transform-modules-systemjs';
// @ts-expect-error TODO(cjh): Where to find the type?
import babelPluginTransformModulesCommonJs from '@babel/plugin-transform-modules-commonjs';
// @ts-expect-error TODO(cjh): Where to find the type?
import babelPluginProposalDynamicImport from '@babel/plugin-proposal-dynamic-import';
import babelPluginDynamicVars from '@cocos/babel-plugin-dynamic-import-vars';
import { TransformTargetModule } from '../bundler';
import winston from 'winston';
import { makeVisitorOnModuleSpecifiers } from '../module-specifier-visitor';
import { babelPresetCC } from '@cocos/creator-programming-babel-preset-cc';
import { ConfigInterface } from '@ccbuild/stats-query';

export class BabelTransformer implements Transformer {
    public static buildHelper(): string {
        // @ts-expect-error TODO(cjh): Where to find the type?
        return babel.buildExternalHelpers(null, 'module');
    }

    constructor({
        targets,
        loose,
        targetModule,
        logger,
        optimizeDecorators,
    }: {
        targets: ScriptTargets | undefined;
        loose: boolean;
        targetModule: TransformTargetModule;
        logger: winston.Logger;
        optimizeDecorators: ConfigInterface.IOptimizeDecorators,
    }) {
        this._loose = loose;
        this._targets = targets;
        this._targetModule = targetModule;
        this._logger = logger;
        this._optimizeDecorators = optimizeDecorators;
    }

    public async transform(source: string, options: TransformOptions): Promise<TransformResult> {
        const {
            _logger,
        } = this;

        const {
            fileName,
            isFile,
            sourceFileName,
            moduleId,
            replaceModuleSpecifier,
            isBabelHelper,
        } = options;

        const sourceMaps = !!sourceFileName;

        const targetModule = this._targetModule;
        const babelOptionsBase: babel.TransformOptions = {
            moduleIds: targetModule === TransformTargetModule.systemJsNamed,
            moduleId,
            filename: fileName,
            sourceMaps,
            sourceFileName,

            configFile: false,
            babelrc: false,
        };
        const addTransformModulesPlugin = (plugins: any[]): any[] => {
            if (targetModule === TransformTargetModule.umd) {
                plugins.push([babelPluginTransformModulesUmd]);
            } else if (targetModule === TransformTargetModule.commonJs) {
                plugins.push([babelPluginTransformModulesCommonJs]);
            } else if (targetModule === TransformTargetModule.systemJs || targetModule === TransformTargetModule.systemJsNamed) {
                plugins.push([babelPluginTransformModulesSystemJs]);
            }
            return plugins;
        };

        if (isBabelHelper) {
            const babelFileResult = await babel.transformAsync(source, {
                ...babelOptionsBase,
                plugins: [
                    [babelPluginConstEnum, { transform: 'constObject' }]
                ].concat(addTransformModulesPlugin([])),
            });
            if (!babelFileResult) {
                throwUnexpectedBabelError();
            } else {
                return {
                    code: babelFileResult.code!,
                };
            }
        }

        // const helperModuleRequest = getModuleRequestTo(babelHelpersModuleUid);

        let resolveModuleSpecifier: babel.PluginObj | undefined;

        if (replaceModuleSpecifier) {
            // Resolves them and record the useful information.
            const moduleSpecifierResolveMap: Record<string, string> = {};

            const processModuleSpecifier = (moduleSpecifier: string): void => {
                const replacement = replaceModuleSpecifier(moduleSpecifier);
                if (replacement) {
                    moduleSpecifierResolveMap[moduleSpecifier] = replacement;
                }
            };
            resolveModuleSpecifier = {
                visitor: makeVisitorOnModuleSpecifiers((moduleSpecifierPath) => {
                    const moduleSpecifier = moduleSpecifierPath.node.value;
                    processModuleSpecifier(moduleSpecifier);
                    // An in-place babel plugin which apply the resolve result.
                    if (moduleSpecifier in moduleSpecifierResolveMap) {
                        moduleSpecifierPath.replaceWith(babel.types.stringLiteral(moduleSpecifierResolveMap[moduleSpecifier]));
                    }
                }),
            };
        }

        // 2020.10.10: esbuild will treat empty files(not using es6 features) as commonjs modules.
        // 1. for commonjs modules, esbuild will generate strange _commonjs wrapper to handle.
        // 2. If a module (transitively) export star from commonjs modules, the module is
        // treated as commonjs module and will only export a default binding.
        const injectEmptyExportStmt: babel.PluginObj = {
            visitor: { Program: { exit: (path) => {
                if (path.node.body.length === 0) {
                    path.node.body.push(
                        babel.types.exportNamedDeclaration(
                            undefined,
                            [],
                        ));
                }
            } } },
        };

        const transformCodePassResult = await babel.transformAsync(source, {
            ...babelOptionsBase,
            presets: [
                [{ plugins: [
                    [babelPluginConstEnum, { transform: 'constObject' }],
                    [babelPluginProposalDynamicImport],
                ] }],
                [babelPresetEnv, {
                    modules: false,
                    targets: this._targets,
                    loose: this._loose,
                } as babelPresetEnv.Options],
                [{ plugins: [
                    [injectEmptyExportStmt],
                    [babelPluginDynamicVars],
                    [resolveModuleSpecifier], // Resolve module specifiers
                    ...addTransformModulesPlugin([]),
                ] }],
                [babelPresetCC, {
                    allowDeclareFields: true,
                    ccDecoratorHelpers: 'inline',
                    fieldDecorators: this._optimizeDecorators.fieldDecorators,
                } as babelPresetCC.Options],
                [{ plugins: [
                    // [importHelperPlugin, { helperModuleName: helperModuleRequest }],
                ] }],
            ],
        });

        if (!transformCodePassResult || !transformCodePassResult.code) {
            throwUnexpectedBabelError();
        }

        if (transformCodePassResult.map?.sourcesContent) {
            if (isFile) {
                delete transformCodePassResult.map.sourcesContent;
            }
        }

        return {
            code: transformCodePassResult.code!,
            map: transformCodePassResult.map? JSON.stringify(transformCodePassResult.map) : undefined,
        };

        function throwUnexpectedBabelError(): never {
            throw new Error(`Babel returned empty result`);
        }
    }

    private _targetModule: TransformTargetModule;
    private _targets: ScriptTargets | undefined;
    private _loose: boolean;
    private _logger: winston.Logger;
    private _optimizeDecorators: ConfigInterface.IOptimizeDecorators;
}