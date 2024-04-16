

import * as rollup from 'rollup';
import ps from 'path';
import { pathToFileURL, URL } from 'url';
import { Mod, ModLo, ModuleType } from '@cocos/creator-programming-mod-lo';
import { cjsMetaUrlExportName } from '@cocos/creator-programming-mod-lo';
import { isBareSpecifier } from '@ccbuild/utils';

// NOTE: DO NOT REMOVE the null character `\0` as it may be used by other plugins
// e.g. https://github.com/rollup/rollup-plugin-node-resolve/blob/313a3e32f432f9eb18cc4c231cc7aac6df317a51/src/index.js#L74
const HELPERS = 'cce:/internal/rollupPluginModLoBabelHelpers.js';

function $({
    modLo,
    origin,
}: {
    modLo: ModLo;
    origin?: URL;
}): rollup.Plugin {
    const myName = 'rollup-plugin-mod-lo';
    
    const loadMetaMap: Record<string, {
        url: Readonly<URL>;
        type: ModuleType;
    }> = {};

    const originURL = origin ?? pathToFileURL(ps.join(process.cwd(), ps.sep));

    return {
        name: myName,
        resolveId,
        load,
    };

    async function resolveId(
        this: rollup.PluginContext,
        source: string,
        importer: string | undefined,
        _options: { custom?: rollup.CustomPluginOptions },
    ): Promise<rollup.PartialResolvedId | null> {
        if (source === HELPERS) {
            return {
                id: HELPERS,
            };
        }
        
        let resolved;

        try {
            if (!importer) {
                resolved = await modLo.resolve(
                    source,
                );
            } else {
                const loadMeta = loadMetaMap[importer];
                if (!loadMeta) {
                    return null;
                }
                const {
                    url: importerURL,
                    type: importerModLoType,
                } = loadMeta;
        
                resolved = await modLo.resolve(
                    source,
                    importerURL,
                    importerModLoType,
                );
            }
        } catch (err) {
            // If we can't resolve a bare specifier from CommonJS, treat it as external
            const importerModLoType = importer && loadMetaMap[importer]?.type;
            if (isBareSpecifier(source) && importerModLoType === 'commonjs') {
                return {
                    id: `data:text/javascript,${encodeURIComponent(`
                    export const ${cjsMetaUrlExportName} = '${source}';
                    `)}`,
                };
            }

            // For otherwise errors, we deliver them to "messages".
            return this.error(err as string | Error);
        }

        if (resolved.isExternal) {
            return {
                external: true,
                id: source,
            };
        } else {
            return {
                id: resolved.url.href,
            };
        }
    }

    async function load(
        this: rollup.PluginContext,
        id: string,
    ): Promise<rollup.LoadResult | null> {
        let url: URL;
        try {
            url = new URL(id);
        } catch {
            return null;
        }

        let modLoModule: Mod;
        try {
            modLoModule = await modLo.load(url);
        } catch (err) {
            return null;
        }

        loadMetaMap[id] = {
            url,
            type: modLoModule.type,
        };

        const source = await modLoModule.module();

        return {
            code: source.code,
            map: source.map,
        };
    }
}

namespace $ {
    export function filterWarns(
        warning: rollup.RollupWarning,
        defaultHandler: rollup.WarningHandler): void {
        if (warning.code === 'CIRCULAR_DEPENDENCY') {
            if (warning.cycle && warning.cycle.every((id) => id.includes('node_modules'))) {
                return;
            }
        }
        defaultHandler(warning);
    }

    export const helperModule = HELPERS;
}

export default $;
