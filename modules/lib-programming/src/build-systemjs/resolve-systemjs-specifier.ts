
import type * as rollup from 'rollup';
import ps from 'path';

const prefix = 'systemjs-source';

const systemJsSourceRoot = ps.dirname(
    require.resolve('@editor/systemjs-source/systemjs/src/system.js'));

const resolveSystemJsSpecifier: rollup.Plugin = {
    name: 'resolve-systemjs-specifier',
    resolveId: (id: string) => {
        if (!id.startsWith(prefix)) {
            return null;
        } else {
            return require.resolve(ps.join(systemJsSourceRoot,
                ...(id.substr(prefix.length)).split('/').filter((s) => s.length !== 0)));
        }
    },
};

export default resolveSystemJsSpecifier;
