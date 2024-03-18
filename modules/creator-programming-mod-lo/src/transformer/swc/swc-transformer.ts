import { CjsInfo } from "../../cjs/detect";
import { InputSourceMap, Transformer, TransformOptions, TransformTargets } from "../transformer";
import * as swc from '@swc/core';
import Visitor from '@swc/core/Visitor';
import { transformJson } from "../transform-json";
import { SourceMap } from "../../mod-lo";
import { CommonJsMod, EsmMod, JavaScriptSource, JsonMod, TransformResolver, TransformResult } from "../../mods";
import { ToCjs } from "./plugins/to-cjs";
import { ModuleSpecifierVisitor } from "./plugins/module-specifier-visitor";
import { detectCjsExports } from "../../cjs/detect-exports";

export class SwcTransformer implements Transformer {
    constructor ({
        targets,
        loose,
        useDefineForClassFields,
        allowDeclareFields,
    }: {
        targets?: Readonly<TransformTargets>;
        loose: boolean;
        useDefineForClassFields: boolean;
        allowDeclareFields: boolean;
    }) {
        this._loose = loose;
        this._targets = targets;
        this._useDefineForClassFields = useDefineForClassFields;
        this._allowDeclareFields = allowDeclareFields;
    }

    /**
     * Transform an ESM module.
     */
    public async transform(url: URL, source: string, inputSourceMap: InputSourceMap | undefined, options: TransformOptions): Promise<EsmMod> {
        const {
            code,
            map,
        } = await this._transformIntoEsm(
            url,
            source,
            inputSourceMap,
            options,
            true,
            undefined,
        );
        return new SwcEsmMod(
            url,
            code,
            map,
            source,
        );
    }

    /**
     * Transform a JSON module into ESM representation.
     */
    public async transformJson(url: URL, source: string, inputSourceMap: InputSourceMap | undefined): Promise<JsonMod> {
        const jsonEsmSource = transformJson(url, source);
        return new SwcJsonMod(
            url,
            jsonEsmSource,
            undefined,
            source,
        );
    }

    /**
     * Transform a CommonJS module into ESM representation.
     */
    public async transformCommonJs(url: URL, source: string, inputSourceMap: InputSourceMap | undefined): Promise<CommonJsMod> {
        const cjsExportsInfo = detectCjsExports(source);
        const toCjsVisitor = new ToCjs(cjsExportsInfo);
        const toCjs: swc.Plugin = (program) => toCjsVisitor.visitProgram(program);
        const {
            code,
            map,
        } = await this._transformIntoEsm(
            url,
            source,
            inputSourceMap,
            undefined,
            false,
            [toCjs],
        );
        return new SwcCommonJsMod(
            url,
            code,
            map,
            source,
        );
    }

    public loadHelper(_url: URL): Promise<EsmMod> {
        throw new Error(`swc transformer does not use helper.`);
    }

    private _targets?: Readonly<TransformTargets>;
    private _loose: boolean;
    private _useDefineForClassFields: boolean;
    private _allowDeclareFields: boolean;

    private async _transformIntoEsm(
        url: URL,
        source: string,
        inputSourceMap: InputSourceMap | undefined,
        options: TransformOptions | undefined,
        isModule: boolean,
        plugins: swc.Plugin[] | undefined,
    ) {
        // TODO
        // isModule = true;
        const swcCompiler = new swc.Compiler();
        const swcInputSourceMap = normalizeSourceMapAsSwcInput(inputSourceMap);
        const swcTargets = this._targets ? toSwcTargets(this._targets) : undefined;
        const loose = this._loose;
        const swcOptions: NonNullable<Parameters<swc.Compiler['transform']>[1]> = {
            isModule,
            filename: url.href,
            configFile: false, // Explicitly toggle off config read
            swcrc: false, // Explicitly toggle off config read
            inputSourceMap: swcInputSourceMap,
            sourceFileName: url.href,
            jsc: {
                loose,
                parser: {
                    syntax: 'typescript',
                    decorators: true,
                    dynamicImport: true,
                },
            },
            env: {
                targets: swcTargets,
                loose,
            },
        };
        if (plugins && plugins.length !== 0) {
            swcOptions.plugin = swc.plugins(plugins);
        }
        // console.log(`Transforming ${url.href}`);
        const swcOutput = swcCompiler.transformSync(
            source,
            swcOptions,
        );
        // console.log(`Transforming ${url.href} done`);
        return {
            code: swcOutput.code,
            map: swcOutput.map,
        };
    }
}

class SwcModBase {
    constructor(url: Readonly<URL>, code: string, map: string | undefined, originalSource: string) {
        this._url = url;
        this._code = code;
        this._map = map;
        this._originalSource = originalSource;
    }

    public async systemjs(resolver?: TransformResolver): Promise<TransformResult> {
        const swcParserConfig: swc.ParserConfig = {
            syntax: 'ecmascript',
            classPrivateProperty: true,
            decorators: true,
            decoratorsBeforeExport: true,
            dynamicImport: true,
            exportDefaultFrom: true,
            importMeta: true,
            topLevelAwait: true,
            importAssertions: true,
        };

        const swcParseOptions: swc.ParseOptions = {
            ...swcParserConfig,
        };

        const swcCompiler = new swc.Compiler();
        const ast = swcCompiler.parseSync(this._code, swcParseOptions);

        const specifierCollector = new SpecifiersCollector();
        specifierCollector.visitProgram(ast);
        const specifiers = specifierCollector.specifiers;

        const swcInputSourceMap = this._map;
        const swcOptions: NonNullable<Parameters<swc.Compiler['transform']>[1]> = {
            isModule: true,
            filename: this._url.href,
            configFile: false, // Explicitly toggle off config read
            swcrc: false, // Explicitly toggle off config read
            inputSourceMap: swcInputSourceMap,
            sourceFileName: this._url.href,
            jsc: {
                loose: false,
                parser: swcParserConfig,
            },
            module: {
                type: 'systemjs',
            }
        };
        // console.log(`TransformingSystem ${this._url.href}`);
        const swcOutput = swcCompiler.transformSync(
            ast,
            swcOptions,
        );
        // console.log(`TransformingSystem Done ${this._url.href}`);
        return {
            moduleSpecifiers: specifiers,
            source: {
                code: swcOutput.code,
                map: swcOutput.map,
            },
        };
    }

    public generate(): JavaScriptSource {
        return {
            code: this._code,
            map: this._map,
        };
    }

    private _code: string;
    private _map: string | undefined;
    protected _url: Readonly<URL>;
    protected _originalSource: string;
}

class SwcEsmMod extends SwcModBase implements EsmMod {
    public readonly type = 'esm';

    public source() {
        return super.generate();
    }

    public module() {
        return this.source();
    }
}

class SwcJsonMod extends SwcModBase implements JsonMod {
    public readonly type = 'json';

    public content() {
        return this._originalSource;
    }

    public module() {
        return super.generate();
    }
}

class SwcCommonJsMod extends SwcModBase implements CommonJsMod {
    public readonly type = 'commonjs';

    public source(): JavaScriptSource {
        return {
            code: this._originalSource,
            map: undefined,
        };
    }

    public module() {
        return super.generate();
    }
}

function normalizeSourceMapAsSwcInput (sourceMap: SourceMap | null | undefined): string | undefined {
    return typeof sourceMap === 'string'
        ? sourceMap
        : JSON.stringify(sourceMap) ?? undefined
}

function toSwcTargets(transformTargets: Readonly<TransformTargets>) {
    return transformTargets as any;
}

class SpecifiersCollector extends ModuleSpecifierVisitor {
    get specifiers() {
        return this._specifiers;
    }

    protected doVisitModuleSpecifier(stringLiteral: swc.StringLiteral) {
        this._specifiers.push({
            value: stringLiteral.value,
            start: stringLiteral.span.start,
            end: stringLiteral.span.end,
        });
    }

    private _specifiers: Array<{
        value: string;
        start: number;
        end: number;
    }> = [];
}
