import cjsModuleLexer from 'cjs-module-lexer';
// TODO: Not working in certain circumstances: https://github.com/endojs/endo/issues/1083
// import { analyzeCommonJS as analyzeCommonJsX } from '../../static/cjs-module-analyzer';
import { detectRequiresFromSourceSync } from './detect';
export interface CjsExportsInfo {
    exports: string[];
    reexports: string[];
}

export function detectCjsExports(source: string) {
    // `requires` may be also parsed from cjs-module-lexer.
    // Let's watch it:
    // https://github.com/guybedford/cjs-module-lexer/pull/10
    const { exports, reexports } = cjsModuleLexer.parse(source);
    return {
        exports,
        reexports,
    };
}

export interface CommonJsAnalyzeResult {
    requires: string[];
    exports: string[];
    reexports: string[];
}

export function analyzeCommonJs(source: string) {
    const requires = detectRequiresFromSourceSync(source);
    // `requires` may be also parsed from cjs-module-lexer.
    // Let's watch it:
    // https://github.com/guybedford/cjs-module-lexer/pull/10
    const { exports, reexports } = detectCjsExports(source);
    return {
        requires,
        exports,
        reexports,
    };
}