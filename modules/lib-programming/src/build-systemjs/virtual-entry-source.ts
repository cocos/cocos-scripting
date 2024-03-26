import type * as rollup from 'rollup';
import ps from 'path';

export const PREFIX = `\0virtual:`;

export default function virtual(modules: Record<string, string>): rollup.Plugin {
    const resolvedIds = new Map<string, string>();

    Object.keys(modules).forEach((id) => {
        resolvedIds.set(ps.resolve(id), modules[id]);
    });

    return {
        name: 'virtual',

        async resolveId(id, importer): Promise<rollup.ResolvedId | string | null> {
            if (id in modules) {
                return PREFIX + id;
            }

            if (importer) {
                const importerNoPrefix = importer.startsWith(PREFIX)
                    ? importer.slice(PREFIX.length)
                    : importer;
                const resolved = await this.resolve(id, importerNoPrefix, { skipSelf: true });
                if (resolved && resolvedIds.has(resolved.id)) {
                    return PREFIX + resolved;
                } else {
                    return resolved;
                }
            }

            return null;
        },

        load(id): string | null | undefined {
            if (id.startsWith(PREFIX)) {
                const idNoPrefix = id.slice(PREFIX.length);
                return idNoPrefix in modules ? modules[idNoPrefix] : resolvedIds.get(idNoPrefix);
            }

            return null;
        },
    };
}
