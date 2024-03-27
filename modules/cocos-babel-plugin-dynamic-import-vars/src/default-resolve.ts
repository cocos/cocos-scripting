import type { CustomResolve, SpecifierCandidate, SpecifierParts } from './index';
import globby from 'globby';
import ps from 'path';

export interface Options {
    /**
     * For example:
     * ```js
     * {
     *   '.js': ['.js', '.ts', '.tsx'], // Specifiers ended with '.js' will resolved to, '.ts', '.tsx'.
     * }
     * ```
     */
    extMap?: Record<string, string[]>;

    /**
     * If import(`./*.js`) is resolved as `./x.ts`,
     * should we use:
     * - `import('./x.js')` (as-is),
     * - `import('x.ts')` (resolved), or
     * - `import('./x')` (drop)?
     */
    forwardExt?: 'drop' | 'resolved' | 'keep-with-test';
}

const defaultExtMap: Record<string, readonly string[]> = {
    '.js': ['.js', '.ts'],
    '.mjs': ['.mjs', '.ts'],
} as const;

export default function createDefaultResolver(options?: Options): CustomResolve {
    const forwardExt: NonNullable<Options['forwardExt']> = options?.forwardExt ?? 'keep-with-test';

    return (specifierParts: SpecifierParts, fileName: string) => {
        const prefix = specifierParts[0];
        if (prefix === null ||
            !(prefix.startsWith('./') || prefix.startsWith('../'))) {
            return;
        }

        const extMap = options?.extMap ?? defaultExtMap;
    
        let glob = specifierParts.map((part) => part === null ? '*' : part).join('');
        const matchedExt = Object.entries(extMap).find(([ext]) => glob.toLowerCase().endsWith(ext));
        if (matchedExt) {
            const [src, targets] = matchedExt;
            glob = `${glob.substr(0, glob.length - src.length)}${joinExtensions(targets)}`;
        }
    
        const candidates = globby.sync(glob, {
            cwd: ps.dirname(fileName),
        }).map((resolved): SpecifierCandidate => {
            let resolvedStem: string;
            let resolvedExt: string;
            let testExt: string;
            if (!matchedExt) {
                resolvedStem = resolved;
                testExt = resolvedExt = '';
            } else {
                const [src, targets] = matchedExt;
                const target = targets.find((target) => resolved.toLowerCase().endsWith(target));
                if (!target) {
                    resolvedStem = resolved;
                    testExt = resolvedExt = '';
                } else {
                    resolvedStem = resolved.substr(0, resolved.length - target.length);
                    resolvedExt = target;
                    testExt = src;
                }
            }

            const test = keepRelative(`${resolvedStem}${testExt}`);

            let specifier: string;
            if (forwardExt === 'keep-with-test') {
                specifier = `${resolvedStem}${testExt}`;
            } else if (forwardExt === 'resolved') {
                specifier = `${resolvedStem}${resolvedExt}`;
            } else {
                specifier = resolvedStem;
            }

            return [
                test,
                keepRelative(specifier),
            ];
        });
        if (candidates.length === 0) {
            return;
        }

        return candidates;
    };
}

function joinExtensions(extensions: readonly string[]) {
    return `.{${extensions.map((ext) => ext.startsWith('.') ? ext.substr(1) : ext).join(',')}}`;
}

function keepRelative(resolved: string) {
    return resolved.startsWith('./') || resolved.startsWith('../') ? resolved : `./${resolved}`;
}
