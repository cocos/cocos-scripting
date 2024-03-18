import { CircularReferenceReportOptions, InputSourceMap, Transformer, TransformOptions, TransformTargets } from "../transformer";
// @ts-expect-error
import babelPluginSyntaxTopLevelAwait from '@babel/plugin-syntax-top-level-await';
import babelPresetCc from '@cocos/creator-programming-babel-preset-cc';
import { ParserPlugin } from '@babel/parser';
import babelPluginAnnotateCCClass from './babel-plugins/plugin-annotate-ccclass';
import bpDetectCircularReference from './babel-plugins/plugin-detect-circular';
import babelPresetEnv from '@babel/preset-env';
import * as babel from '@babel/core';
import { asserts, assertsNonNullable } from "../../../../creator-programming-common/lib/asserts";
import { RawSourceMap } from "source-map";
import { InternalTransformOptions, SourceMap } from "../../mod-lo";
import { createBabelPluginDetectAndRewriteImports } from "./babel-plugins/detect-imports";
// @ts-expect-error
import babelPluginTransformSystemJs from '@babel/plugin-transform-modules-systemjs';
// @ts-expect-error
import babelPluginProposalDynamicImport from '@babel/plugin-proposal-dynamic-import';
import generate from '@babel/generator';
import { transformJson } from "../transform-json";
import importHelper from './babel-plugins/plugin-import-helper';
import { CommonJsMod, EsmMod, JavaScriptSource, JsonMod, Specifier, TransformResolver, TransformResult } from "../../mods";
import * as generator from '@babel/generator';
import { FastCommonJsMod } from "../transform-common-js-fast";
import bpDynamicImportVars, { Options as DynamicImportVarsOptions } from './babel-plugins/dynamic-import-vars';
import { pluginCheckObsolete } from "./babel-plugins/plugin-check-obsolete";

const syncBabelTransform = true;

export class BabelTransformer implements Transformer {
    constructor({
        targets,
        loose,
        useDefineForClassFields,
        allowDeclareFields,
        cr,
        dynamicImportVars,
        _internalTransform,
        _helperModule = '',
    }: {
        targets?: TransformTargets;
        loose: boolean;
        useDefineForClassFields: boolean;
        allowDeclareFields: boolean;
        /**
         * 循环引用检测选项。只会对 asset 类型的模块生效。
         */
        cr?: bpDetectCircularReference.Options;

        dynamicImportVars?: boolean;

        _internalTransform?: InternalTransformOptions;

        /**
        * Helper 模块的 ID。
        */
        _helperModule?: string;
    }) {
        this._targets = targets;
        const assumptions: BabelAssumptions = {};
        if (loose) {
            // https://babeljs.io/docs/en/babel-plugin-transform-classes#loose
            assumptions.constantSuper = true;
            assumptions.noClassCalls = true;
            assumptions.setClassMethods = true;
            assumptions.superIsCallableConstructor = true;

            // https://babeljs.io/docs/en/babel-plugin-transform-parameters#loose
            assumptions.ignoreFunctionLength = true;

            // // ??
            // assumptions.arrayLikeIsIterable = true;

            // // ??
            // assumptions.iterableIsArray = true;

            // https://babeljs.io/docs/en/babel-plugin-transform-template-literals#loose
            assumptions.ignoreToPrimitiveHint = true;
            assumptions.mutableTemplateObject = true;

            // https://babeljs.io/docs/en/babel-plugin-proposal-nullish-coalescing-operator#loose
            assumptions.noDocumentAll = true;

            // // ??
            // assumptions.noIncompleteNsImportDetection = true;

            // https://babeljs.io/docs/en/babel-plugin-proposal-private-methods#loose
            assumptions.privateFieldsAsProperties = true;

            // // ??
            // assumptions.pureGetters = true;

            // https://babeljs.io/docs/en/babel-plugin-transform-computed-properties#loose
            assumptions.setComputedProperties = true;

            // https://babeljs.io/docs/en/babel-plugin-proposal-class-properties#loose
            // assumptions.setPublicClassFields = true;

            // https://babeljs.io/docs/en/babel-plugin-proposal-object-rest-spread#loose
            assumptions.setSpreadProperties = true;
            assumptions.objectRestNoSymbols = true;

            // https://babeljs.io/docs/en/babel-plugin-transform-for-of#loose
            assumptions.skipForOfIteratorClosing = true;

            // The following does not corresponding to the legacy loose.
            // assumptions.noNewArrows = true;

            // Since we do not use umd, amd or commonjs, we don't need these assumptions.
            // assumptions.constantReexports = false;
            // assumptions.enumerableModuleMeta = false;
        }
        if (!useDefineForClassFields) {
            assumptions.setPublicClassFields = true;
        }
        this._assumptions = assumptions;
        this._loose = loose;
        this._allowDeclareFields = allowDeclareFields;
        this._cr = cr;
        this._internalTransform = _internalTransform;
        if (dynamicImportVars) {
            this._dynamicImportVarsOptions = {
                resolve: {
                    forwardExt: 'resolved',
                },
            };
        }
        if (_helperModule) {
            this._babelPluginImportHelper = importHelper({ helperModule: _helperModule });
        }
    }

    /**
     * Transform an ESM module.
     */
    public async transform(url: URL, source: string, map: InputSourceMap | undefined, options: TransformOptions, disableTransform?: boolean): Promise<EsmMod> {
        const { plugins, presets } = this._getPluginsPresetsOfModule(options, disableTransform);

        return new BabelEsmMod(
            url,
            source,
            map ? normalizeSourceMapAsBabelInput(map) : undefined,
            undefined,
            'module',
            this._assumptions,
            presets,
            plugins,
        );
    }

    /**
     * Transform a JSON module into ESM representation.
     */
    public async transformJson(url: URL, source: string, inputSourceMap: InputSourceMap | undefined): Promise<JsonMod> {
        const jsonEsmSource = transformJson(url, source);
        return new BabelJsonMod(
            url,
            jsonEsmSource,
            undefined,
            source,
            'module',
            this._assumptions,
            [this._getEnvPreset()],
            [],
        );
    }

    /**
     * Transform a CommonJS module into ESM representation.
     */
    public async transformCommonJs(url: URL, source: string, map: InputSourceMap | undefined, id: string | undefined, disableTransform?: boolean): Promise<CommonJsMod> {
        const fastCommonJsMod = new FastCommonJsMod(source, id);
        if (disableTransform) {
            return fastCommonJsMod;
        } else {
            const { code: esmRepCode, map: esmRepMap } = fastCommonJsMod.module();
            const { plugins, presets } = this._getPluginsPresetsOfCommonJsModule();
            return new BabelCommonJsMod(
                url,
                esmRepCode,
                esmRepMap ? normalizeSourceMapAsBabelInput(esmRepMap) : undefined,
                source,
                'module',
                this._assumptions,
                presets,
                plugins,
            );
        }
    }

    public async loadHelper(url: URL) {
        // @ts-ignore
        const source = babel.buildExternalHelpers(null, 'module');
        return new BabelEsmMod(
            url,
            source,
            undefined,
            undefined,
            'module',
            this._assumptions,
            [],
            [],
        );
    }

    private _targets?: TransformTargets;
    private _loose: boolean;
    private _assumptions: BabelAssumptions | undefined;
    private _allowDeclareFields: boolean;
    private _cr?: CircularReferenceReportOptions;
    private _dynamicImportVarsOptions?: DynamicImportVarsOptions;
    private _babelPluginImportHelper: babel.PluginItem | undefined;
    private _internalTransform?: InternalTransformOptions;

    /**
     * Throws if babel transform failed.
     */
    private _throwBabelReturnNull(): never {
        throw new Error(`Failed to transform.`);
    }

    private _getPluginsPresetsOfModule(options: TransformOptions, disableTransform?: boolean) {
        const plugins: babel.PluginItem[] = [];
        const presets: babel.PluginItem[] = [];

        if (disableTransform) {
            return { plugins, presets };
        }

        presets.push(this._getEnvPreset());

        if (options.checkObsolete) {
            plugins.push(pluginCheckObsolete);
        }
        plugins.push(babelPluginSyntaxTopLevelAwait);

        presets.push([babelPresetCc, {
            allowDeclareFields: this._allowDeclareFields,
        } as babelPresetCc.Options]);

        if (options) {
            if (this._dynamicImportVarsOptions) {
                plugins.push([
                    bpDynamicImportVars, this._dynamicImportVarsOptions,
                ]);
            }

            if (options.annotate) {
                plugins.push([
                    babelPluginAnnotateCCClass,
                    options.annotate as babelPluginAnnotateCCClass.Options,
                ]);
            }

            if (options.cr && this._cr) {
                plugins.push([bpDetectCircularReference, this._cr]);
            }
        }

        if (this._babelPluginImportHelper) {
            plugins.push(this._babelPluginImportHelper);
        }
        
        return {
            plugins,
            presets,
        };
    }

    private _getPluginsPresetsOfCommonJsModule() {
        const plugins: babel.PluginItem[] = [];
        const presets: babel.PluginItem[] = [];

        presets.push(this._getEnvPreset());
        
        return {
            plugins,
            presets,
        };
    }

    private _getEnvPreset(): babel.PluginItem {
        const babelPresetEnvOptions: babelPresetEnv.Options = {
            modules: false,
            targets: this._targets,
            loose: this._loose,
            // We need explicitly specified targets.
            // Ignore it to avoid the engine's parent dirs contain unexpected config.
            ignoreBrowserslistConfig: true,
            include: [
                'proposal-class-properties',
                ...(this._internalTransform?.includes ?? []),
            ],
        };

        if (this._internalTransform) {
            babelPresetEnvOptions.exclude = this._internalTransform.excludes;
        }
        
        return [babelPresetEnv, babelPresetEnvOptions];
    }
}

type BabelAst = babel.types.File | babel.types.Program;

type SourceTextOrBabelAst = string | BabelAst;

type BabelPass = Pick<babel.TransformOptions, 'plugins' | 'presets'>;

type BabelAssumptionKey
    = 'arrayLikeIsIterable'
    | 'constantReexports'
    | 'constantSuper'
    | 'enumerableModuleMeta'
    | 'ignoreFunctionLength'
    | 'ignoreToPrimitiveHint'
    | 'iterableIsArray'
    | 'mutableTemplateObject'
    | 'noClassCalls'
    | 'noDocumentAll'
    | 'noIncompleteNsImportDetection'
    | 'noNewArrows'
    | 'objectRestNoSymbols'
    | 'privateFieldsAsProperties'
    | 'pureGetters'
    | 'setClassMethods'
    | 'setComputedProperties'
    | 'setPublicClassFields'
    | 'setSpreadProperties'
    | 'skipForOfIteratorClosing'
    | 'superIsCallableConstructor'
    ;

type BabelAssumptions = Partial<Record<BabelAssumptionKey, boolean>>;

type BabelTransformOptions = babel.TransformOptions & {
    assumptions?: BabelAssumptions;
};

class BabelModBase {
    constructor(
        url: Readonly<URL>,
        source: string,
        map: RawSourceMap | undefined,
        originalSource: string | undefined,
        sourceType: BabelModBase['_sourceType'],
        assumptions: BabelAssumptions | undefined,
        presets: babel.PluginItem[],
        plugins: babel.PluginItem[],
    ) {
        this._url = url;
        this._source = source;
        this._map = map;
        this._originalSource = originalSource ?? source;
        this._sourceType = sourceType;
        this._presets = presets;
        this._plugins = plugins;
        this._assumptions = assumptions;
    }

    public async module() {
        return await this._transform(
            this._plugins,
            this._presets,
        );
    }

    public async systemjs(resolver?: TransformResolver): Promise<TransformResult> {
        let specifiers: Specifier[] = [];

        const systemJsPlugins = [
            [babelPluginTransformSystemJs],
            // Dynamic import() transformation must be enabled using the
            // @babel/plugin-proposal-dynamic-import plugin. Babel 8 will
            // no longer transform import() without using that plugin.
            [babelPluginProposalDynamicImport],
        ];
        if (resolver) {
            systemJsPlugins.unshift([createBabelPluginDetectAndRewriteImports({
                specifiers,
                rewrite: resolver,
            })]);
        }

        const source = await this._transformMultiplePasses([
            { plugins: this._plugins, presets: this._presets, },
            { plugins: systemJsPlugins },
        ]);
        
        return {
            source,
            moduleSpecifiers: specifiers,
        };
    }

    private _sourceType: 'module' | 'script';
    private _assumptions: BabelAssumptions | undefined;
    private _plugins: babel.PluginItem[];
    private _presets: babel.PluginItem[];
    protected _url: Readonly<URL>;
    protected _source: string;
    protected _originalSource: string;
    private _map: RawSourceMap | undefined;

    private async _transform(
        plugins: babel.PluginItem[],
        presets: babel.PluginItem[],
    ): Promise<JavaScriptSource> {
        const {
            _url: url,
            _source: source,
            _sourceType: sourceType,
            _map: inputSourceMap,
        } = this;

        const babelResult = await (syncBabelTransform
            ? babel.transformSync
            : babel.transformAsync
        )(source, {
            filename: url.href,

            code: true,
            ast: false,
            sourceType,

            inputSourceMap,
            ...this._getGenerateOptions(),

            assumptions: this._assumptions,

            configFile: false,
            presets,
            plugins,
            // parserOpts: {
            //     plugins: parserPlugins,
            // },
        } as BabelTransformOptions);
        assertsNonNullable(babelResult);
        assertsNonNullable(babelResult.code);
        return {
            code: babelResult.code,
            map: babelResult.map as RawSourceMap | undefined
        };
    }

    private async _transformMultiplePasses(passes: BabelPass[]): Promise<JavaScriptSource> {
        asserts(passes.length > 0);

        const {
            _url: url,
            _source: source,
            _sourceType: sourceType,
            _map: inputSourceMap,
        } = this;

        const firstPass = passes[0];

        const firstPassResult = await (syncBabelTransform
            ? babel.transformSync
            : babel.transformAsync
        )(source, {
            code: false,
            ast: true,
            sourceType,
            filename: url.href,

            assumptions: this._assumptions,

            ...firstPass,
        } as BabelTransformOptions);
        assertsNonNullable(firstPassResult);
        assertsNonNullable(firstPassResult.ast);

        let ast = firstPassResult.ast;
        for (let iPass = 1; iPass < passes.length; ++iPass) {
            const pass = passes[iPass];

            const passResult = await (syncBabelTransform
                ? babel.transformFromAstSync
                : babel.transformFromAstAsync
            )(
                ast,
                source,
                {
                    code: false,
                    ast: true,
                    cloneInputAst: true, // TODO: binding
                    filename: url.href,
                    ...pass,
                } as babel.TransformOptions & {
                    cloneInputAst: boolean;
                }
            );
            assertsNonNullable(passResult);
            assertsNonNullable(passResult.ast);
            ast = passResult.ast;
        }

        const { code, map } = generator.default(
            ast,
            {
                ...this._getGenerateOptions(),
            },
            source,
        );

        return {
            code,
            map: (map ?? undefined) as RawSourceMap | undefined
        };
    }

    private _getGenerateOptions(): generator.GeneratorOptions {
        const {
            _url: url,
        } = this;

        return {
            filename: url.href,
            sourceMaps: true,
            sourceFileName: url.href,
        };
    }
}

class BabelEsmMod extends BabelModBase implements EsmMod {
    public readonly type = 'esm';

    public source() {
        return super.module();
    }

    public module() {
        return this.source();
    }
}

class BabelJsonMod extends BabelModBase implements JsonMod {
    public readonly type = 'json';

    public content() {
        return this._originalSource;
    }
}

class BabelCommonJsMod extends BabelModBase implements CommonJsMod {
    public readonly type = 'commonjs';

    public source(): JavaScriptSource {
        return {
            code: this._originalSource,
            map: undefined,
        };
    }
}

function normalizeSourceMapAsBabelInput (sourceMap: SourceMap | null | undefined) {
    return typeof sourceMap === 'string'
        ? JSON.parse(sourceMap) as RawSourceMap
        : sourceMap ?? undefined
}

const parserPlugins: ParserPlugin[] = [
    'asyncGenerators',
    'bigInt',
    'classPrivateMethods',
    'classPrivateProperties',
    'classProperties',
    // 'classStaticBlock',
    'decimal',
    // 'decorators',
    'decorators-legacy',
    // 'doExpressions',
    'dynamicImport',
    // 'estree',
    'exportDefaultFrom',
    // 'exportNamespaceFrom', // deprecated
    // 'flow',
    // 'flowComments',
    // 'functionBind',
    'functionSent',
    'importMeta',
    // 'jsx',
    'logicalAssignment',
    // 'importAssertions',
    'moduleStringNames',
    'nullishCoalescingOperator',
    'numericSeparator',
    'objectRestSpread',
    'optionalCatchBinding',
    'optionalChaining',
    // 'partialApplication',
    // 'pipelineOperator',
    'placeholders',
    // 'privateIn',
    // 'throwExpressions',
    'topLevelAwait',
    // 'typescript',
    // 'v8intrinsic',
    // ['decorators', {
    //     decoratorsBeforeExport: true,
    // }],
    // ['pipelineOperator', {
    //     proposal: 'minimal',
    // }],
    // ['flow', {
    //     all: true,
    // }],
];
