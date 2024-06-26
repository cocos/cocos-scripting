
// @ts-ignore
import { resolveImportMap, resolveIfNotPlainOrUrl, resolveAndComposeImportMap } from '../../systemjs/src/common.js';
import { systemJSPrototype } from '../globals';
import { baseUrl } from './base-url';

export type Imports = Record<string, string>;
export interface ImportMap {
    imports?: Imports,
    scopes?: Record<string, Imports>,
}

export const importMap: ImportMap = { imports: {}, scopes: {} };

export function setImportMap(json: ImportMap, location: string) {
    resolveAndComposeImportMap(json, location || baseUrl, importMap);
}

export function extendsImportMap(json: ImportMap, location: string) {
    const importMapUrl = resolveIfNotPlainOrUrl(location, baseUrl);
    resolveAndComposeImportMap(json, importMapUrl || location, importMap);    
}

function throwUnresolved(id: string, parentUrl: string) {
    throw new Error(`Unresolved id: ${id} from parentUrl: ${parentUrl}`);
}

systemJSPrototype.resolve = function(id: string, parentUrl: string) {
    parentUrl = parentUrl || baseUrl;
    return resolveImportMap(importMap, resolveIfNotPlainOrUrl(id, parentUrl) || id, parentUrl) || throwUnresolved(id, parentUrl);
};
