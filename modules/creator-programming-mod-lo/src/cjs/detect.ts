import * as babel from '@babel/core';
import { collectRequires } from '../transformer/babel/babel-plugins/collect-requires';
import { detectCjsExports } from './detect-exports';

export interface CjsInfo {
    requires: string[];
    exports: string[];
    reexports: string[];
}

export async function detectCjsInfo(source: string) {
    const requires = await detectRequiresFromSource(source);
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

async function detectRequiresFromSource(source: string) {
    const ast = await babel.parseAsync(source);
    return ast ? collectRequires(ast) : [];
}

export function detectRequiresFromSourceSync(source: string) {
    const ast = babel.parseSync(source);
    return ast ? collectRequires(ast) : [];
}
