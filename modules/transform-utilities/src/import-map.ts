import { pathToFileURL, moduleSpecifierURLRelative } from './path-url-interop';
import { ImportMap } from '@ccbuild/utils';

export function createImportMapFromFileMapping(importMapFile: string, mapping: Record<string, string>): ImportMap {
    const importMapFileURL = pathToFileURL(importMapFile);
    const importMap: ImportMap = {
        imports: {},
        scopes: {},
    };

    for (const aliasModuleId of Object.keys(mapping)) {
        const chunkEntryFile = mapping[aliasModuleId];
        const relativeURL = moduleSpecifierURLRelative(importMapFileURL, pathToFileURL(chunkEntryFile));
        importMap.imports[aliasModuleId] = relativeURL;
    }
    return importMap;
}