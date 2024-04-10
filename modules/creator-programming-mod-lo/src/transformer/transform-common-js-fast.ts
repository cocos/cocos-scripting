import { CjsExportsInfo, CommonJsAnalyzeResult, detectCjsExports } from '../cjs/detect-exports';
import MagicString from 'magic-string';
import { CommonJsMod, JavaScriptSource, Specifier, TransformResolver } from '../mods';
import dedent from 'dedent';
import { modLoBuiltinModCommonJsURL } from '../utils/mod-lo-builtin-mods';
import { cjsMetaUrlExportName } from '../cjs/share';
import { analyzeCommonJs } from '../cjs/detect-exports';
import { assert } from 'console';
// @ts-ignore
import babelPluginTransformSystemJs from '@babel/plugin-transform-modules-systemjs';
// @ts-ignore
import babelPluginProposalDynamicImport from '@babel/plugin-proposal-dynamic-import';
import * as babel from '@babel/core';
import { assertsNonNullable } from '@ccbuild/utils';
import { parse } from 'acorn';
import { simple } from 'acorn-walk';

export class FastCommonJsMod implements CommonJsMod {
    public readonly type = 'commonjs';

    constructor(source: string, id: string | undefined) {
        this._source = source;
        this._id = id;
        this._cjsAnalyzeResult = analyzeCommonJs(source);
    }

    source() {
        return {
            code: this._source,
            map: undefined,
        };
    }

    public module() {
        return wrapCommonJs(this._source, this._id, this._cjsAnalyzeResult, modLoBuiltinModCommonJsURL, true);
    }

    public systemjs(resolver?: TransformResolver) {
        const {
            _source: code,
            _cjsAnalyzeResult: analyzeResult,
        } = this;

        const moduleSpecifiers: Specifier[] = [];
        
        const resolveAndPushSpecifier = (specifier: string, resolver: TransformResolver) => {
            const resolved = resolver(specifier);
            moduleSpecifiers.push({ value: specifier, resolved });
            return resolved ? resolved : specifier;
        };
    
        const transformedAnalyzeResult = !resolver
            ? analyzeResult
            : { ...analyzeResult, requires: analyzeResult.requires.map((request) => resolveAndPushSpecifier(request, resolver)) };
        const cjsModuleLoaderModuleSpecifier = modLoBuiltinModCommonJsURL;
        const resolvedCjsModuleLoaderModuleSpecifier = !resolver
            ? cjsModuleLoaderModuleSpecifier
            : resolveAndPushSpecifier(cjsModuleLoaderModuleSpecifier, resolver);
        const resultSource = wrapCommonJs(code, this._id, transformedAnalyzeResult, resolvedCjsModuleLoaderModuleSpecifier, false);

        return {
            source: resultSource,
            moduleSpecifiers,
        };
    }

    private _source: string;
    private _id: string | undefined;
    private _cjsAnalyzeResult: CommonJsAnalyzeResult;
}

class IdAlloc {
    constructor(source: string, requestCount: number, namedExports: string[]) {
        const ast = parse(source, {
            ecmaVersion: 'latest',
            sourceType: 'script',
        });

        const myIds = new Set<string>();

        simple(ast, {
            Identifier(node) {
                myIds.add((node as unknown as { name: string }).name);
            },
        });

        const generateUid = (id: string) => {
            const uidPrefix = `_${id}`;
            if (!myIds.has(uidPrefix)) {
                myIds.add(uidPrefix);
                return uidPrefix;
            }
            for (let i = 0; ; ++i) {
                const uid = `${uidPrefix}${i}`;
                if (!myIds.has(uid)) {
                    myIds.add(uid);
                    return uid;
                }
            }
        };
        
        this.loaderVar = generateUid('cjsLoader');
        this.cjsExportsVar = generateUid('cjsExports');
        this.reqVars = Array.from({ length: requestCount }, (_) => generateUid('req'));
        this.cjsNamedExportLocalVars = namedExports.map((name) => generateUid(name));
    }

    public loaderVar: string;
    public cjsExportsVar: string;
    public reqVars: string[] = [];
    public cjsNamedExportLocalVars: string[] = [];
}

function wrapCommonJs(
    code: string,
    id: string | undefined,
    analyzeResult: CommonJsAnalyzeResult,
    cjsModuleLoaderModuleSpecifier: string,
    esm: boolean,
): JavaScriptSource {
    const { pre, post, indent } = getModLoCommonJsWrap(code, id, analyzeResult, cjsModuleLoaderModuleSpecifier, esm);

    const magicString = new MagicString(code);

    magicString
        .indent(' '.repeat(indent))
        .prepend(pre)
        .append(post)
        ;

    const outputCode = magicString.toString();
    return {
        code: outputCode,
        map: undefined,
    };
}

const COMMON_JS_CODE_PLACE_HOLDER = '$$COMMONJS_CODE_PLACE_HOLDER$$';

function getModLoCommonJsWrap(
    code: string,
    id: string | undefined,
    analyzeResult: CommonJsAnalyzeResult,
    cjsModuleLoaderModuleSpecifier: string,
    esm: boolean,
): {
    pre: string;
    post: string;
    indent: number;
} {
    const wrapper = esm
        ? generateModLoCommonJsWrapCodeEsm(code, id, analyzeResult, cjsModuleLoaderModuleSpecifier)
        : generateModLoCommonJsWrapCodeSystemJs(code, id, analyzeResult, cjsModuleLoaderModuleSpecifier);
    const iCommonJsPlaceHolder = wrapper.indexOf(COMMON_JS_CODE_PLACE_HOLDER);
    assert(iCommonJsPlaceHolder >= 0);
    const iLastNewLine = wrapper.lastIndexOf('\n', iCommonJsPlaceHolder);
    assert(iLastNewLine <= iCommonJsPlaceHolder);
    return {
        pre: wrapper.substr(0, iCommonJsPlaceHolder) + '\n',
        post: '\n' + wrapper.substr(iCommonJsPlaceHolder + COMMON_JS_CODE_PLACE_HOLDER.length),
        indent: iCommonJsPlaceHolder - iLastNewLine,
    };
}

function generateModLoCommonJsWrapCodeEsm(code: string, id: string | undefined, analyzeResult: CommonJsAnalyzeResult, cjsModuleLoaderModuleSpecifier: string): string {
    const {
        requires,
        exports,
        reexports: _reexports,
    } = analyzeResult;

    const idAlloc = new IdAlloc(code, requires.length, exports);

    const magicString = new MagicString(COMMON_JS_CODE_PLACE_HOLDER);

    const head: string[] = [];

    head.push(`import ${idAlloc.loaderVar} from '${cjsModuleLoaderModuleSpecifier}';`);

    head.push(...requires.map((request, requestIndex) =>
        `import { ${cjsMetaUrlExportName} as ${idAlloc.reqVars[requestIndex]}} from '${request}';`));

    head.push(`let ${idAlloc.cjsExportsVar};`);

    head.push(...exports.map((_, index) =>
        `let ${idAlloc.cjsNamedExportLocalVars[index]};`));

    head.push(`const ${cjsMetaUrlExportName} = ${id ? `'${id}'` : `import.meta.url`};`);

    const tail: string[] = [];

    const updateExportVarsStatements = exports.map((exportName, index) =>
        `${idAlloc.cjsNamedExportLocalVars[index]} = module.exports.${exportName};`);

    const resolveMap = requires.length === 0
        ? `{}`
        : `() => ({\n${requires.map((request, requestIndex) => `  '${request}': ${idAlloc.reqVars[requestIndex]},`).join('\n')}\n})`;

    magicString
        .prepend(`// #region ORIGINAL CODE\n\n`)
        .append(`\n// #endregion ORIGINAL CODE\n\n`)
        .append(dedent`
            ${idAlloc.cjsExportsVar} = module.exports;
            ${updateExportVarsStatements.join('\n')}
            \n
        `)
        .prepend(`${idAlloc.loaderVar}.define(${cjsMetaUrlExportName}, function (exports, require, module, __filename, __dirname) {\n`)
        .append(`}, ${resolveMap});`)
        ;

    tail.push(`export { ${idAlloc.cjsExportsVar} as default };`);

    tail.push(`export { ${cjsMetaUrlExportName} }`);

    magicString
        .prepend(head.join('\n') + '\n')
        .append('\n' + tail.join('\n') + (tail.length === 0 ? '' : '\n'))
        ;

    return magicString.toString();
}

function generateModLoCommonJsWrapCodeSystemJs(code: string, id: string | undefined, analyzeResult: CommonJsAnalyzeResult, cjsModuleLoaderModuleSpecifier: string): string {
    const esmResult = generateModLoCommonJsWrapCodeEsm(code, id, analyzeResult, cjsModuleLoaderModuleSpecifier);
    const babelResult = babel.transformSync(esmResult, {
        plugins: [
            [babelPluginTransformSystemJs],
        ],
    });
    assertsNonNullable(babelResult);
    assertsNonNullable(babelResult.code);
    return babelResult.code;
}