
import type * as babel from '@babel/core';
import decomposeDynamicImportVars from './decompose-dynamic-import-vars';
import type { SpecifierParts } from './decompose-dynamic-import-vars';
import createDefaultResolver from './default-resolve';
import type { Options as DefaultResolveOptions } from './default-resolve';

export type { SpecifierParts };

export type SpecifierCandidate = string | [string, string];

/**
 * Custom specifier resolution.
 * @param specifierParts Specifier parts.
 * @param fileName The source file name(provided by babel).
 * @returns If `undefined` or empty array is returned, this plugin won't do nothing.
 */
export type CustomResolve = (specifierParts: SpecifierParts, fileName: string) => SpecifierCandidate[] | undefined;

export type { DefaultResolveOptions };

export interface Options {
    /**
     * Either the options to configure the default resolver or supply a custom resolver.
     */
    resolve?: DefaultResolveOptions | CustomResolve;
}

export default function({ types }: typeof babel): babel.PluginObj<{
    filename?: string;
    opts?: Options;
}> {
    // Ensures that we won't loop infinitely.
    const myImports: Set<babel.types.Import> = new Set();

    const createImport = () => {
        const importNode = types.import();
        myImports.add(importNode);
        return importNode;
    };

    return {
        visitor: {
            CallExpression: (path, state) => {
                const fileName = state.filename;
                if (!fileName) {
                    return;
                }

                const node = path.node;
                if (node.callee.type !== 'Import' ||
                    node.arguments.length !== 1 ||
                    !types.isExpression(node.arguments[0]) ||
                    types.isStringLiteral(node.arguments[0])) {
                    return;
                }

                if (myImports.has(node.callee)) {
                    return;
                }

                const originalSpecifier = node.arguments[0];

                const specifierParts = decomposeDynamicImportVars(originalSpecifier);
                if (specifierParts.length === 0) {
                    return;
                }

                const options = state.opts ?? {};

                let resolve: CustomResolve;
                if (typeof options.resolve === 'function') {
                    resolve = options.resolve;
                } else {
                    resolve = createDefaultResolver(options.resolve);
                }

                const candidates = resolve(specifierParts, fileName);
                if (!candidates || candidates.length === 0) {
                    return;
                }

                const specifierArg = () => types.identifier('path');

                const candidateSwitchCases = candidates.map((candidate) => {
                    let test: string;
                    let specifier: string;
                    if (Array.isArray(candidate)) {
                        test = candidate[0];
                        specifier = candidate[1];
                    } else {
                        test = candidate;
                        specifier = candidate;
                    }
                    return types.switchCase(
                        types.stringLiteral(test),
                        [types.returnStatement(types.callExpression(
                            createImport(), [types.stringLiteral(specifier)]))],
                    )
                });

                const lambda = types.parenthesizedExpression(
                    types.arrowFunctionExpression(
                        [specifierArg()],
                        types.blockStatement([types.switchStatement(
                            specifierArg(),
                            candidateSwitchCases.concat([types.switchCase(
                                null,
                                [types.returnStatement(types.callExpression(
                                    createImport(), [specifierArg()]))],
                            )]),
                        )])),
                );

                path.replaceWith(types.callExpression(lambda, [ originalSpecifier ]));
            },
        },
    };
}
