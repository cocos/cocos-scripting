import { asserts, tryParseURL, i18nTranslate } from '@cocos/creator-programming-common';
import { ParsedSpecifierMap, ParsedImportMap } from './parsed-import-map';
import { URL } from 'url';

/**
 * @param specifier
 * @param asURL 
 * @param parentURL 
 * @param importMap 
 */
export function importMapResolve(
    specifier: string, asURL: URL | null, parentURL: URL, importMap: ParsedImportMap) {
    const normalizedSpecifier = asURL ? asURL.href : specifier;

    const parentURLString = parentURL.href;
    for (const [scopePrefix, scopeImports] of importMap.scopes) {
        if (scopePrefix === parentURLString || scopePrefix.endsWith('/') && parentURLString.startsWith(scopePrefix)) {
            const scopeImportsMatch = resolveImportsMatch(normalizedSpecifier, asURL, scopeImports);
            if (scopeImportsMatch) {
                return scopeImportsMatch;
            }
        }
    }

    const topLevelImportsMatch = resolveImportsMatch(normalizedSpecifier, asURL, importMap.imports);
    if (topLevelImportsMatch) {
        return topLevelImportsMatch;
    } else {
        return undefined;
    }
}

function resolveImportsMatch(normalizedSpecifier: string, asURL: URL | null, specifierMap: ParsedSpecifierMap) {
    for (const [specifierKey, resolutionResult] of specifierMap) {
        if (specifierKey === normalizedSpecifier) {
            if (resolutionResult === null) {
                throw new ImportMapNullEntryError();
            } else {
                return resolutionResult;
            }
        }
        if (specifierKey.endsWith('/') &&
            normalizedSpecifier.startsWith(specifierKey) &&
            (asURL === null || isSpecialURL(asURL))
        ) {
            if (resolutionResult === null) {
                throw new ImportMapNullEntryError();
            }
            const afterPrefix = normalizedSpecifier.substr(specifierKey.length);
            asserts(resolutionResult.href.endsWith('/'));
            const url = tryParseURL(afterPrefix, resolutionResult);
            if (!url) {
                throw new ImportMapImportMatchError();
            }
            if (!url.href.startsWith(resolutionResult.href)) {
                throw new ImportMapBackTrackingError(specifierKey);
            }
            return url;
        }
    }
    return null;
}

function isSpecialURL(url: URL): boolean {
    // https://url/utils.spec.whatwg.org/#is-special
    return [
        'ftp:',
        'file:',
        'http:',
        'https:',
        'ws:',
        'wss:',
        'db:',
    ].includes(url.protocol);
}

export class ImportMapNullEntryError extends Error {
    constructor() { super(i18nTranslate('import_map_null_entry_error')); }
}

export class ImportMapImportMatchError extends Error {
    constructor() { super(i18nTranslate('import_map_import_match_error')); }
}

export class ImportMapBackTrackingError extends Error {
    constructor(prefix: string) { super(i18nTranslate('import_map_back_tracking_error', { prefix })); }
}
