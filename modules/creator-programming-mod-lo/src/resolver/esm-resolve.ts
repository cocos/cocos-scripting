
import { URL, fileURLToPath, pathToFileURL } from 'url';
import { asserts, isRelativeSpecifier, hasFileProtocol, tryParseURL } from '@ccbuild/utils';
import { InvalidModuleSpecifierError, InvalidPackageConfigurationError, InvalidPackageTargetError, ModuleNotFoundError, PackagePathNotExportedError, UnsupportedDirectoryImportError } from './resolve-error';
import fs from 'fs-extra';
import ps from 'path';
import { ParsedImportMap, importMapResolve } from '@cocos/creator-programming-import-maps';
import { isNodeJsBuiltinModule, toNodeProtocolUrl } from '../utils/node-builtins';

/**
 * Reference:
 * https://nodejs.org/api/esm.html#esm_resolver_algorithm
 * Modification:
 * - Import map are considered.
 */
export async function esmResolve(specifier: string, parentURL: URL, options?: {
    importMap?: ParsedImportMap;
    conditions?: Conditions;
    legacyMainResolveExtensions?: string[];
}): Promise<URL> {
    const {
        conditions = defaultConditions,
        legacyMainResolveExtensions = defaultLegacyMainResolveExtensions,
        importMap,
    } = options ?? {};

    const context: ResolveContext = {
        conditions,
        legacyMainResolveExtensions,
    };

    let asURL: URL | null;
    if (isRelativeSpecifier(specifier)) {
        asURL = new URL(specifier, parentURL);
    } else {
        asURL = tryParseURL(specifier) ?? null;
    }

    if (importMap) {
        const importMapResolved = importMapResolve(specifier, asURL, parentURL, importMap);
        if (importMapResolved) {
            return importMapResolved;
        }
    }

    if (asURL) {
        return asURL;
    }

    if (specifier.startsWith('#')) {
        return packageImportsResolve(specifier, parentURL, context);
    }

    return packageResolve(specifier, parentURL, context);
}

export const defaultConditions: readonly string[] = ['import', 'cc'];

type Conditions = readonly string[];

export const defaultLegacyMainResolveExtensions = ['.js', '.json'] as const as readonly string[];

interface ResolveContext {
    conditions: Conditions;
    legacyMainResolveExtensions: readonly string[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function packageImportsResolve(_specifier: string, _parentURL: URL, _context: ResolveContext): URL {
    throw new Error(`We currently do not support package 'imports' field.`);
}

function packageResolve(specifier: string, parentURL: URL, context: ResolveContext): URL {
    const { packageName, isScoped, packageSubpath } = parsePackageName(specifier);

    // Package self resolve
    const selfURL = packageSelfResolve(packageName, packageSubpath, parentURL, context);
    if (selfURL !== undefined) {
        return selfURL;
    }

    const onlyFilePackages = true;
    let packageJsonUrl = new URL(`./node_modules/${packageName}/package.json`, parentURL);
    // eslint-disable-next-line no-constant-condition
    while (true) {
        if (onlyFilePackages && !hasFileProtocol(packageJsonUrl)) {
            break;
        }

        const packageUrl = new URL('.', packageJsonUrl);

        if (!dirExists(packageUrl)) {
            const lastPackageJsonPathname = packageJsonUrl.pathname;

            packageJsonUrl = new URL(
                `${isScoped ? '../../../../' : '../../../'}node_modules/${packageName}/package.json`,
                packageJsonUrl);

            if (packageJsonUrl.pathname === lastPackageJsonPathname) {
                break;
            }

            continue;
        }

        const packageJson = readPackageJson(packageJsonUrl);

        if (!isNullOrUndefined(packageJson.exports)) {
            return packageExportsResolve(
                packageJsonUrl,
                packageSubpath,
                packageJson.exports,
                context,
                parentURL,
            );
        } else if (packageSubpath === '.') {
            return legacyMainResolve(
                packageJsonUrl,
                packageJson,
                context,
            );
        } else {
            const resolved = new URL(packageSubpath, packageJsonUrl);
            return resolved;
        }
    }

    if (packageSubpath === '.' && isNodeJsBuiltinModule(packageName)) {
        return new URL(toNodeProtocolUrl(specifier));
    }

    throw new ModuleNotFoundError(specifier, parentURL);
}

function parsePackageName(specifier: string, base?: URL): {
    packageName: string,
    isScoped: boolean,
    packageSubpath: string,
} {
    let packageName: string;
    let isScoped = false;

    if (specifier.length === 0) {
        throw new InvalidModuleSpecifierError(specifier, undefined, base?.href);
    }

    const iFirstSlash = specifier.indexOf('/');
    if (!specifier.startsWith('@')) {
        packageName = iFirstSlash < 0
            ? specifier
            : specifier.slice(0, iFirstSlash);
    } else {
        if (iFirstSlash < 0) {
            throw new InvalidModuleSpecifierError(specifier, undefined, base?.href);
        } else {
            isScoped = true;
            const iSecondSlash = specifier.indexOf('/', iFirstSlash + 1);
            packageName = iSecondSlash < 0 ? specifier : specifier.slice(0, iSecondSlash);
        }
    }

    if (invalidPackageNameRegEx.exec(packageName)) {
        throw new InvalidModuleSpecifierError(specifier, 'is not a valid package name', base?.href);
    }

    const packageSubpath = `.${specifier.slice(packageName.length)}`;

    return { packageName, isScoped, packageSubpath };
}

function packageSelfResolve(packageName: string, packageSubpath: string, parentURL: URL, context: ResolveContext): URL | undefined {
    const packageJson = readPackageScope(parentURL);
    if (!packageJson.exists || isNullOrUndefined(packageJson.exports)) {
        return undefined;
    }
    if (packageName === packageJson.name) {
        return packageExportsResolve(packageJson.url, packageSubpath, packageJson.exports, context, parentURL);
    }
    return undefined;
}

export function readPackageScope(url: URL, baseUrl?: URL): NormalizedPackageJson {
    let packageJsonURL = new URL('./package.json', url);
    // eslint-disable-next-line no-constant-condition
    while (true) {
        if (packageJsonURL.pathname.endsWith('node_modules/package.json')) {
            break;
        }
        const packageJson = readPackageJson(packageJsonURL, baseUrl);
        if (packageJson.exists) {
            return packageJson;
        }
        const lastPackageJsonPathname = packageJsonURL.pathname;
        packageJsonURL = new URL('../package.json', packageJsonURL);
        if (packageJsonURL.pathname === lastPackageJsonPathname) {
            break;
        }
    }
    return createNonExistingPackageJson(packageJsonURL);
}

function isNullOrUndefined<T>(v: T | null | undefined): v is null | undefined {
    return v === null || v === undefined;
}

interface NormalizedPackageJson {
    url: Readonly<URL>;
    name: string | undefined;
    type: 'none' | 'module' | 'commonjs' | undefined;
    main: string | undefined;
    imports: Record<string, unknown> | undefined;
    exports: unknown;
    exists: boolean;
}

function createNonExistingPackageJson(url: URL): NormalizedPackageJson {
    return {
        url,
        name: undefined,
        type: 'none',
        main: undefined,
        imports: undefined,
        exports: undefined,
        exists: false,
    };
}

function readPackageJson(url: URL, baseUrl?: URL): NormalizedPackageJson {
    if (!hasFileProtocol(url)) {
        return createNonExistingPackageJson(url);
    }

    let source;
    try {
        const path = fileURLToPath(url);
        source = fs.readFileSync(path, 'utf8');
    } catch {
        return createNonExistingPackageJson(url);
    }

    let json;
    try {
        json = JSON.parse(source);
    } catch (err) {
        throw new InvalidPackageConfigurationError(new URL('.', url).href, baseUrl?.href);
    }

    const { main, name, type, imports, exports } = json;

    const normalized: NormalizedPackageJson = {
        url,
        name: typeof name === 'string' ? name : undefined,
        type: type === 'module' || type === 'commonjs' ? type : undefined,
        main: typeof main === 'string' ? main : undefined,
        imports: typeof imports !== 'object' || imports === null ? undefined : imports,
        exports,
        exists: true,
    };


    return normalized;
}

function isConditionalExportsMainSugar(exports: unknown, packageJSONUrl: URL, base?: URL): boolean {
    if (typeof exports === 'string' || Array.isArray(exports)) {
        return true;
    }
    
    if (typeof exports !== 'object' || exports === null) {
        return false;
    }

    const keys = Object.getOwnPropertyNames(exports);
    let isConditionalSugar = false;
    let i = 0;
    for (let j = 0; j < keys.length; j++) {
        const key = keys[j];
        const curIsConditionalSugar = key === '' || key[0] !== '.';
        if (i++ === 0) {
            isConditionalSugar = curIsConditionalSugar;
        } else if (isConditionalSugar !== curIsConditionalSugar) {
            const errorMessage =
                '"exports" cannot contain some keys starting with \'.\' and some not.' +
                ' The exports object must either be an object of package subpath keys' +
                ' or an object of main entry condition name keys only.';
            throw new InvalidPackageConfigurationError(packageJSONUrl.href, base?.href);
        }
    }
    return isConditionalSugar;
}

function packageExportsResolve(
    packageJSONUrl: URL,
    packageSubpath: string,
    exports: unknown,
    context: ResolveContext,
    base?: URL,
): URL {
    asserts(!isNullOrUndefined(exports));

    if (isConditionalExportsMainSugar(exports, packageJSONUrl, base)) {
        exports = { '.': exports };
    }

    if (Object.prototype.hasOwnProperty.call(exports, packageSubpath) &&
        !packageSubpath.includes('*') &&
        !packageSubpath.endsWith('/')
    ) {
        asserts(typeof exports === 'object');
        const target = (exports as Record<string, unknown>)[packageSubpath];
        const resolveResult = resolvePackageTarget(
            packageJSONUrl,
            target,
            '',
            packageSubpath,
            base,
            false,
            false,
            false,
            context,
        );
        if (resolveResult == null) {
            throw exportsNotFound(packageSubpath, packageJSONUrl, base);
        }
        return resolveResult;
    }

    let bestMatch = '';
    let bestMatchSubpath = '';
    for (const key of Object.getOwnPropertyNames(exports)) {
        const patternIndex = key.indexOf('*');
        if (patternIndex >= 0 &&
            packageSubpath.startsWith(key.slice(0, patternIndex))
        ) {
            if (packageSubpath.endsWith('/')) {
                // TODO:
                // emitTrailingSlashPatternDeprecation(packageSubpath, packageJSONUrl, base);
            }
            const patternTrailer = key.slice(patternIndex + 1);
            if (packageSubpath.length >= key.length &&
                packageSubpath.endsWith(patternTrailer) &&
                patternKeyCompare(bestMatch, key) === 1 &&
                key.lastIndexOf('*') === patternIndex
            ) {
                bestMatch = key;
                bestMatchSubpath = packageSubpath.slice(
                    patternIndex,
                    packageSubpath.length - patternTrailer.length,
                );
            }
        }
    }

    if (bestMatch) {
        const target = (exports as Record<string, unknown>)[bestMatch];
        const resolveResult = resolvePackageTarget(
            packageJSONUrl,
            target,
            bestMatchSubpath,
            bestMatch,
            base,
            true,
            false,
            packageSubpath.endsWith('/'),
            context,
        );

        if (resolveResult == null) {
            throw exportsNotFound(packageSubpath, packageJSONUrl, base);
        }
        return resolveResult;
    }

    throw exportsNotFound(packageSubpath, packageJSONUrl, base);
}

function patternKeyCompare(a: string, b: string): number {
    const aPatternIndex = a.indexOf('*');
    const bPatternIndex = b.indexOf('*');
    const baseLenA = aPatternIndex === -1 ? a.length : aPatternIndex + 1;
    const baseLenB = bPatternIndex === -1 ? b.length : bPatternIndex + 1;
    if (baseLenA > baseLenB) return -1;
    if (baseLenB > baseLenA) return 1;
    if (aPatternIndex === -1) return 1;
    if (bPatternIndex === -1) return -1;
    if (a.length > b.length) return -1;
    if (b.length > a.length) return 1;
    return 0;
}

function resolvePackageTarget(
    packageJSONUrl: URL,
    target: unknown,
    subpath: string,
    packageSubpath: string,
    base: URL | undefined,
    pattern: boolean,
    internal: boolean,
    isPathMap: boolean,
    context: ResolveContext,
): URL | null | undefined {
    if (typeof target === 'string') {
        return resolvePackageTargetString(
            target,
            subpath,
            packageSubpath,
            packageJSONUrl,
            base,
            pattern,
            internal,
            isPathMap,
            context,
        );
    }

    if (Array.isArray(target)) {
        return resolvePackageTargetArray(
            packageJSONUrl,
            target,
            subpath,
            packageSubpath,
            base,
            pattern,
            internal,
            isPathMap,
            context,
        );
    }

    if (typeof target === 'object' && target !== null) {
        return resolvePackageTargetObject(
            packageJSONUrl,
            target as Record<string, unknown>,
            subpath,
            packageSubpath,
            base,
            pattern,
            internal,
            isPathMap,
            context,
        );
    }

    if (target === null) {
        return null;
    }

    throw invalidPackageTarget(
        packageSubpath,
        target,
        packageJSONUrl,
        internal,
        base,
    );
}

function resolvePackageTargetString(
    target: string,
    subpath: string,
    match: string,
    packageJSONUrl: URL,
    base: URL | undefined,
    pattern: boolean,
    internal: boolean,
    isPathMap: boolean,
    context: ResolveContext,
): URL {
    if (subpath !== '' && !pattern && target[target.length - 1] !== '/') {
        throw invalidPackageTarget(match, target, packageJSONUrl, internal, base);
    }

    if (!target.startsWith('./')) {
        if (internal && !target.startsWith('../') && !target.startsWith('/') && !tryParseURL(target)) {
            const exportTarget = pattern
                ? applyPattern(target, subpath)
                : target + subpath;
            return packageResolve(
                exportTarget,
                packageJSONUrl,
                context,
            );
        } else {
            throw invalidPackageTarget(match, target, packageJSONUrl, internal, base);
        }
    }

    // Note: `target` starts with './' now
    if (invalidSegmentRegEx.exec(target.slice(2))) {
        if (deprecatedInvalidSegmentRegEx.exec(target.slice(2)) === null) {
            if (!isPathMap) {
                const request = pattern ?
                    match.replace('*', () => subpath) :
                    match + subpath;
                const resolvedTarget = pattern ?
                    patternRegEx[Symbol.replace](target, () => subpath) :
                    target;
                emitInvalidSegmentDeprecation(resolvedTarget, request, match, packageJSONUrl, internal, base, true);
            }
        } else {
            throw invalidPackageTarget(match, target, packageJSONUrl, internal, base);
        }
    }

    const resolved = new URL(target, packageJSONUrl);
    const resolvedPath = resolved.pathname;
    const packagePath = new URL('.', packageJSONUrl);
    if (!resolvedPath.startsWith(packagePath.pathname)) {
        throw invalidPackageTarget(match, target, packageJSONUrl, internal, base);
    }

    if (subpath === '') {
        return resolved;
    }

    if (invalidSegmentRegEx.exec(subpath) !== null) {
        const request = pattern ? match.replace('*', () => subpath) : match + subpath;
        if (deprecatedInvalidSegmentRegEx.exec(subpath) === null) {
            if (!isPathMap) {
                const resolvedTarget = pattern ?
                    patternRegEx[Symbol.replace](target, () => subpath) :
                    target;
                emitInvalidSegmentDeprecation(resolvedTarget, request, match, packageJSONUrl, internal, base, false);
            }
        } else {
            throwInvalidSubpath(request, match, packageJSONUrl, internal, base);
        }
    }

    if (pattern) {
        return new URL(
            patternRegEx[Symbol.replace](resolved.href, () => subpath),
        );
    }

    return new URL(subpath, resolved);
}

function exportsNotFound(subpath: string, packageJSONUrl: URL, base: URL | undefined): PackagePathNotExportedError {
    return new PackagePathNotExportedError(
        new URL('.', packageJSONUrl).href,
        subpath,
        base?.href,
    );
}

function invalidPackageTarget(
    subpath: string,
    target: any,
    packageJSONUrl: URL,
    internal: boolean,
    base: URL | undefined,
): InvalidPackageTargetError {
    if (typeof target === 'object' && target !== null) {
        target = JSON.stringify(target, null, '');
    } else {
        target = `${target}`;
    }
    return new InvalidPackageTargetError(
        subpath,
        target,
        internal,
        new URL('.', packageJSONUrl).href,
        base?.href,
    );
}

function throwInvalidSubpath(
    request: string,
    match: string,
    packageJSONUrl: URL,
    internal: boolean,
    base: URL | undefined,
): void {
    const reason = `request is not a valid match in pattern "${match}" for the "${internal ? 'imports' : 'exports'}" resolution of ${fileURLToPath(packageJSONUrl)}`;
    throw new InvalidModuleSpecifierError(request, reason, base?.href);
}

function emitInvalidSegmentDeprecation(...args: any[]): void {
}

function resolvePackageTargetObject(
    packageJSONUrl: URL,
    target: Record<string, unknown>,
    subpath: string,
    packageSubpath: string,
    base: URL | undefined,
    pattern: boolean,
    internal: boolean,
    isPathMap: boolean,
    context: ResolveContext,
): URL | null | undefined {
    const keys = Object.getOwnPropertyNames(target);

    if (keys.some(isArrayIndex)) {
        throw new InvalidPackageConfigurationError(new URL('.', packageJSONUrl).href, base?.href);
    }

    for (const key of keys) {
        if (key === 'default' || context.conditions.includes(key)) {
            const conditionalTarget = target[key];
            const resolveResult = resolvePackageTarget(
                packageJSONUrl,
                conditionalTarget,
                subpath,
                packageSubpath,
                base,
                pattern,
                internal,
                isPathMap,
                context,
            );
            if (resolveResult === undefined) {
                continue;
            }
            return resolveResult;
        }
    }

    return undefined;
}

function resolvePackageTargetArray(
    packageJSONUrl: URL,
    target: unknown[],
    subpath: string,
    packageSubpath: string,
    base: URL | undefined,
    pattern: boolean,
    internal: boolean,
    isPathMap: boolean,
    context: ResolveContext,
): URL | undefined | null {
    if (target.length === 0) {
        return null;
    }
    let lastException: InvalidPackageTargetError | null | undefined;
    for (const targetItem of target) {
        let resolveResult: URL | undefined | null;
        try {
            resolveResult = resolvePackageTarget(
                packageJSONUrl,
                targetItem,
                subpath,
                packageSubpath,
                base,
                pattern,
                internal,
                isPathMap,
                context,
            );
        } catch (e) {
            //  continuing the loop on any Invalid Package Target error.
            if (e instanceof InvalidPackageTargetError) {
                lastException = e;
                continue;
            }
            throw e;
        }
        if (resolveResult === undefined) {
            continue;
        }
        if (resolveResult === null) {
            lastException = null;
            continue;
        }
        return resolveResult;
    }
    if (isNullOrUndefined(lastException)) {
        return lastException;
    } else {
        throw lastException;
    }
}

function applyPattern(s: string, replacer: string): string {
    return s.replace(/\*/g, replacer);
}

// The following are referenced from
// https://github.com/nodejs/node/blob/v18.x/lib/internal/modules/esm/resolve.js#L392-L395

const invalidSegmentRegEx = /(^|\\|\/)((\.|%2e)(\.|%2e)?|(n|%6e|%4e)(o|%6f|%4f)(d|%64|%44)(e|%65|%45)(_|%5f)(m|%6d|%4d)(o|%6f|%4f)(d|%64|%44)(u|%75|%55)(l|%6c|%4c)(e|%65|%45)(s|%73|%53))?(\\|\/|$)/i;
const deprecatedInvalidSegmentRegEx = /(^|\\|\/)((\.|%2e)(\.|%2e)?|(n|%6e|%4e)(o|%6f|%4f)(d|%64|%44)(e|%65|%45)(_|%5f)(m|%6d|%4d)(o|%6f|%4f)(d|%64|%44)(u|%75|%55)(l|%6c|%4c)(e|%65|%45)(s|%73|%53))(\\|\/|$)/i;
const invalidPackageNameRegEx = /^\.|%|\\/;
const patternRegEx = /\*/g;
// Match path segment
const dotOrDotDotOrNodeModulesSegmentRegex = /(^|\\|\/)(\.\.?|node_modules)(\\|\/|$)/;

function isArrayIndex(s: string): boolean {
    const keyNum = +s;
    if (`${keyNum}` !== s) {
        return false;
    }
    return keyNum >= 0 && keyNum < 0xFFFF_FFFF;
}

function legacyMainResolve(
    packageJsonUrl: URL,
    packageJson: NormalizedPackageJson,
    context: ResolveContext,
): URL {
    let guess;
    if (packageJson.main !== undefined) {
        // Note: fs check redundances will be handled by Descriptor cache here.
        if (fileExists(guess = new URL(`./${packageJson.main}`, packageJsonUrl))) {
            return guess;
        }
        for (const extension of context.legacyMainResolveExtensions) {
            if (fileExists(guess = new URL(`./${packageJson.main}${extension}`, packageJsonUrl))) {
                return guess;
            }
        }
        for (const extension of context.legacyMainResolveExtensions) {
            if (fileExists(guess = new URL(`./${packageJson.main}/index${extension}`, packageJsonUrl))) {
                return guess;
            }
        }
        // Fallthrough.
    }
    for (const extension of context.legacyMainResolveExtensions) {
        if (fileExists(guess = new URL(`./index${extension}`, packageJsonUrl))) {
            return guess;
        }
    }
    // Not found.
    throw new ModuleNotFoundError('<main>', new URL('.', packageJsonUrl));
}

function fileExists(url: URL): boolean {
    return (tryStat(url)).isFile();
}

function dirExists(url: URL): boolean {
    return (tryStat(url)).isDirectory();
}

function tryStat(url: URL): fs.Stats {
    try {
        const path = fileURLToPath(url);
        return fs.statSync(path);
    } catch {
        return new fs.Stats();
    }
}
