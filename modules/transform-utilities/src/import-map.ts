import { pathToFileURL, moduleSpecifierURLRelative } from './path-url-interop';

interface ImportMap {
    imports?: Record<string, string>;
    scopes?: Record<string, Record<string, string>>;
}

export function createImportMapFromFileMapping(importMapFile: string, mapping: Record<string, string>): ImportMap {
    const importMapFileURL = pathToFileURL(importMapFile);
    const importMap: ImportMap = {};
    importMap.imports = {};
    for (const aliasModuleId of Object.keys(mapping)) {
        const chunkEntryFile = mapping[aliasModuleId];
        const relativeURL = moduleSpecifierURLRelative(importMapFileURL, pathToFileURL(chunkEntryFile));
        importMap.imports[aliasModuleId] = relativeURL;
    }
    return importMap;
}