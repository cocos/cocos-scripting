import type { URL } from 'url';

export interface ParsedImportMap {
    imports: ParsedSpecifierMap;
    scopes: ParsedScopeMap;
}

export type ParsedSpecifierMap = Array<[string, URL | null]>;

export type ParsedScopeMap = Array<[string, ParsedSpecifierMap]>;
