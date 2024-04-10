import { URL } from 'url';
import { ParsedImportMap, ParsedScopeMap, ParsedSpecifierMap } from './parsed-import-map';
import { i18nTranslate } from '@ccbuild/utils';

export function parseImportMap(json: any, baseUrl: URL) {
    if (typeof json !== 'object') {
        throw new ImportMapParseError(`The top-level value needs to be a JSON object.`);
    }
    const parsed: ParsedImportMap = { imports: [], scopes: [] };
    let nValidKeys = 0;
    if (('imports' in json)) {
        ++nValidKeys;
        const imports = json.imports;
        if (typeof imports !== 'object') {
            throw new ImportMapParseError(`The "imports" top-level key needs to be a JSON object.`);
        }
        parsed.imports = sortAndNormalizeSpecifierMap(imports, baseUrl);
    }
    if (('scopes' in json)) {
        ++nValidKeys;
        const scopes = json.scopes;
        if (typeof scopes !== 'object') {
            throw new ImportMapParseError(`The "scopes" top-level key needs to be a JSON object.`);
        }
        parsed.scopes = sortAndNormalizeScopes(scopes, baseUrl);
    }
    for (const key of Object.keys(json)) {
        if (key !== 'imports' && key !== 'scopes') {
            console.warn(`An invalid top-level key ${key} was present in the import map.`);
        }
    }
    return parsed;
}

function sortAndNormalizeSpecifierMap(originalMap: Record<string, any>, baseUrl: URL) {
    const normalized: ParsedSpecifierMap = [];
    for (const specifierKey in originalMap) {
        const normalizedSpecifierKey = normalizeSpecifierKey(specifierKey, baseUrl);
        if (normalizedSpecifierKey === null) {
            continue;
        }
        const value = originalMap[specifierKey];
        if (typeof value !== 'string') {
            console.warn(`The address need to be strings.`);
            normalized.push([normalizedSpecifierKey, null]);
            continue;
        }
        const addressUrl = parseUrlLikeImportSpecifier(value, baseUrl);
        if (addressUrl === null) {
            console.warn(`The address was invalid.`);
            normalized.push([normalizedSpecifierKey, null]);
            continue;
        }
        if (specifierKey.endsWith('/') && !serializeUrl(addressUrl).endsWith('/')) {
            console.warn(
                `an invalid address was given for the specifier key ${specifierKey}; ` +
                `since ${specifierKey} ended in a slash, the address needs to as well.`);
            normalized.push([normalizedSpecifierKey, null]);
            continue;
        }
        normalized.push([normalizedSpecifierKey, addressUrl]);
    }
    sortMap(normalized);
    return normalized;
}

function sortAndNormalizeScopes(originalMap: Record<string, any>, baseUrl: URL) {
    const normalized: ParsedScopeMap = [];
    for (const scopePrefix in originalMap) {
        const potentialSpecifierMap = originalMap[scopePrefix];
        if (typeof potentialSpecifierMap !== 'object') {
            throw new ImportMapParseError(`The value of the scope with prefix ${scopePrefix} needs to be a JSON object.`);
        }
        const scopePrefixUrl = parseUrl(scopePrefix, baseUrl);
        if (!scopePrefixUrl) {
            console.warn(`The scope prefix URL ${scopePrefixUrl} was not parsable.`);
            continue;
        }
        const normalizedScopePrefix = serializeUrl(scopePrefixUrl);
        normalized.push([
            normalizedScopePrefix,
            sortAndNormalizeSpecifierMap(potentialSpecifierMap, baseUrl),
        ]);
    }
    sortMapReverse(normalized);
    return normalized;
}

function sortMap<T>(map: [string, T][]) {
    return map.sort(([a], [b]) => a > b ? 1 : (a < b ? -1 : 0));
}

function sortMapReverse<T>(map: [string, T][]) {
    return map.sort(([b], [a]) => a > b ? 1 : (a < b ? -1 : 0));
}

function normalizeSpecifierKey(key: string, baseUrl: URL): string | null {
    if (key.length === 0) {
        console.warn(`Specifier keys cannot be the empty string.`);
        return null;
    }
    const url = parseUrlLikeImportSpecifier(key, baseUrl);
    if (url) {
        return serializeUrl(url);
    }
    return key;
}

function parseUrlLikeImportSpecifier(specifier: string, baseUrl: URL): URL | null {
    if (specifier.startsWith('/') ||
        specifier.startsWith('./') ||
        specifier.startsWith('../')) {
        return parseUrl(specifier, baseUrl);
    }
    return parseUrl(specifier);
}

function parseUrl(url: string, base?: URL): URL | null {
    try {
        return new URL(url, base);
    } catch {
        return null;
    }
}

function serializeUrl(url: URL) {
    return url.href;
}

export class ImportMapParseError extends Error {
    constructor(message: string) { super(i18nTranslate('import_map_parse_error')); }
}