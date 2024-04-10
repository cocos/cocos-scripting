
import nodeResolve from 'resolve';
import fs from 'fs-extra';
import { RawSourceMap } from 'source-map';
import { getCjsInteropModuleSource } from './cjs/wrapper';
import { fileURLToPath, URL, pathToFileURL } from 'url';
import { modLoBuiltinLoadMappings } from './utils/mod-lo-builtin-mods';
import { performance } from 'perf_hooks';
import { ImportMap, getBaseName, hasFileProtocol, replaceExtension, tryParseURL, asserts, i18nTranslate, isRelativeSpecifier, ImportRestriction } from '@ccbuild/utils';
import { isCjsInteropUrl, getCjsInteropTarget, createLogger, Logger } from '@cocos/creator-programming-common';
import { defaultConditions, esmResolve, readPackageScope } from './resolver/esm-resolve';
import { CanNotBeBaseURLError, CjsInteropError, ModuleNotFoundError, UnsupportedDirectoryImportError } from './resolver/resolve-error';
import { ParsedImportMap, parseImportMap } from '@cocos/creator-programming-import-maps';
import { cjsResolve } from './resolver/cjs-resolve';
import { BabelTransformer } from './transformer/babel/babel-transformer';
import { CircularReferenceReportOptions, Transformer, TransformOptions } from './transformer/transformer';
// import { SwcTransformer } from './transformer/swc/swc-transformer';
import crypto from 'crypto';
import {
    Mod,
    ModuleType,
    JavaScriptSource,
    SourceMap,
    TransformResult,
    Specifier,
} from './mods';
import minimatch from 'minimatch';

export {
    Mod,
    ModuleType,
    JavaScriptSource,
    SourceMap,
    TransformResult,
    Specifier,
};

type PackageMeta = NonNullable<Parameters<Parameters<typeof nodeResolve>[2]>[2]>;

const esmDataURIPrefix = 'data:text/javascript,';

export class MemoryModule {
    constructor(source: string) {
        this.source = source;
    }

    get source() {
        return this._source;
    }

    set source(value: string) {
        this._source = value;
        this._mTimestamp = performance.now();
    }

    get mTimestamp() {
        return this._mTimestamp;
    }

    private declare _mTimestamp: MTimestamp;
    private declare _source: string;
}

type ModuleFilterRule = string | RegExp;

/**
 * The uniform Module Loader.
 */
export class ModLo {
    constructor({
        transformer: transformerType = 'babel',
        targets,
        exportsConditions,
        loose = false,
        useDefineForClassFields = true,
        allowDeclareFields = true,
        guessCommonJsExports = false,
        _importMetaURLValid = true,
        _helperModule = '',
        cr,
        _compressUUID,
        transformExcludes: transformExcludes,
        logger,
        _internalTransform,
        checkObsolete = false,
        hot,
        importRestrictions,
        preserveSymlinks = false,
    }: ModLoOptions) {
        const transformer = (() => {
            // if (transformerType == 'babel') {
                return new BabelTransformer({
                    targets,
                    loose,
                    useDefineForClassFields,
                    allowDeclareFields,
                    _helperModule,
                    cr,
                    _internalTransform,
                });
            // } else {
            //     return new SwcTransformer({
            //         targets,
            //         loose,
            //         useDefineForClassFields,
            //         allowDeclareFields,
            //     });
            // }
        })();
        this._transformer = transformer;
        this._guessCjsExports = guessCommonJsExports;
        this._logger = logger ?? createLogger({});
        this._checkObsolete = checkObsolete;

        this._compressUUID = _compressUUID;

        this._hot = hot ?? false;

        if (transformExcludes) {
            for (const rule of transformExcludes) {
                this._transformExcludesModuleFilter.add(rule);
            }
        }

        if (_helperModule) {
            this._helperURL = new URL(_helperModule);
            this._helperModuleMTimestamp = performance.now();
        }

        this._importMetaURLValid = _importMetaURLValid;
        this._importRestrictions = importRestrictions;
        this._preserveSymlinks = preserveSymlinks;

        this.setExtraExportsConditions(exportsConditions ?? []);
        this.setLoadMappings({});
    }

    public async getMTimestamp(url: URL): Promise<MTimestamp> {
        if (this._helperURL && url.href === this._helperURL.href) {
            return this._helperModuleMTimestamp;
        }

        const loadURL = this._getLoadURL(url);
        return await this._getMtime(loadURL);
    }

    public async load(url: URL): Promise<Mod> {
        if (this._helperURL && url.href === this._helperURL.href) {
            return await this._transformer.loadHelper(this._helperURL);
        }

        const loadURL = this._getLoadURL(url);

        const source = await this._loadSource(loadURL);

        const moduleType = await this._determinateModuleType(url);

        const disableTransform = moduleType === 'esm' || moduleType === 'commonjs'
            ? this._transformExcludesModuleFilter.test(url)
            : false;
        if (disableTransform) {
            this._logger.info(`Note: transforms are disabled for ${url.href}`);
        }

        let mod: Mod;
        if (moduleType === 'esm') {
            const cr = this._isAssetModule(url);

            const transformOptions: TransformOptions = {
                cr,
                checkObsolete: this._checkObsolete,
            };
            const uuid = this._uuidMap.get(url.href);
            if (uuid !== undefined) {
                const baseName = getBaseName(url);
                const compressedUUID = this._compressUUID(uuid);
                transformOptions.annotate = {
                    baseName,
                    compressedUUID,
                    hot: this._hot,
                };
            }

            mod = await this._transformer.transform(url , source, undefined, transformOptions, disableTransform);
        } else if (moduleType === 'json') {
            mod = await this._transformer.transformJson(url , source, undefined);
        } else {
            asserts(moduleType === 'commonjs', 'Unknown module system.');
            const id = this._importMetaURLValid ? undefined : this._generateCommonJsModuleId(url, source);
            mod = await this._transformer.transformCommonJs(url, source, undefined, id, disableTransform);
        }

        return mod;
    }

    public async resolve(specifier: string, from?: URL, fromType?: ModuleType): Promise<ResolveResult> {
        const parentURL = from ?? this._origin;
        if (!fromType) {
            if (!from) {
                fromType = 'esm';
            } else {
                fromType = await this._determinateModuleType(from);
            }
        }

        // JSON can shall not emit import request.
        asserts(fromType !== 'json');

        const resolved = await this._resolveUnchecked(specifier, parentURL, fromType);

        this._detectImportRestriction(resolved, from);

        if (!resolved.isExternal && !this._preserveSymlinks) {
            const symlinkFollowedURL = this._followSymlinks(resolved.url);
            if (symlinkFollowedURL !== resolved.url) {
                return {
                    isExternal: false,
                    url: symlinkFollowedURL,
                };
            }
        }

        return resolved;
    }

    /**
     * @param externals Can be bare specifiers or URLs.
     */
    public setExternals(externals: string[]) {
        this._externals.push(...externals);
    }

    public addMemoryModule(url: Readonly<URL> | string, source: string) {
        const urlObject = normalizeURLArg(url);
        return this._memoryModules[urlObject.href] = new MemoryModule(source);
    }

    public setUUID(url: string, uuid: string) {
        assertIsURL(url);
        this._uuidMap.set(url, uuid);
    }

    public unsetUUID(url: string) {
        assertIsURL(url);
        this._uuidMap.delete(url);
    }

    public setImportMap(importMap: ImportMap, url: URL) {
        this._parsedImportMap = parseImportMap(importMap, url);
    }

    /**
     * 将一些 URL 映射到另一些 URL。主要用于映射一些 URL 到文件系统上。
     * 注意：
     * - 这个和 import map 不同。它不会改变模块的 URL，只会在加载模块源码时转而去加载文件系统上的。
     * - 键和值要么都以 / 结尾，要么都不以 / 结尾。如果以 / 结尾表示整个目录映射。
     */
    public setLoadMappings(loadMappings: Record<string, string>) {
        this._loadMappings.push(...normalizeLoadMappings(modLoBuiltinLoadMappings));
        if (loadMappings) {
            this._loadMappings.push(...normalizeLoadMappings(loadMappings));
        }
        this._loadMappings.sort(([a], [b]) => a > b ? 1 : -1);
    }

    public setExtraExportsConditions(exportConditions: string[]) {
        this._conditions = [...defaultConditions, ...(exportConditions ?? [])];
    }

    /**
     * 设置属于 asset 的模块 URL 的前缀。
     * @param prefixes 
     */
    public setAssetPrefixes(prefixes: string[]) {
        if (this._preserveSymlinks) {
            this._assetPrefixes = prefixes.slice();
        } else {
            this._assetPrefixes = prefixes.map((prefix) => {
                const url = tryParseURL(prefix);
                if (!url) {
                    return prefix;
                }
                const original = this._followSymlinks(url);
                return original.href;
            });
        }
    }

    private _matchPattern(path: string, pattern: string): boolean {
        return minimatch(path.replace(/\\/g, '/'), pattern.replace(/\\/g, '/'));
    }

    private _detectImportRestriction (resolveResult: ResolveResult, importer?: URL) {
        if (this._importRestrictions) {
            // get resolved id
            let resolvedId: string;
            if (resolveResult.isExternal) {
                resolvedId = resolveResult.specifierOrURL;
            } else if (resolveResult.url.href.startsWith('file://')) {
                resolvedId = fileURLToPath(resolveResult.url.href);
            } else {
                resolvedId = resolveResult.url.href;
            }
            for (const restriction of this._importRestrictions) {
                // If it's an entry chunk, it has no importer.
                let skipDetect = !importer;
                if (importer) {
                    const from = importer.href.startsWith('file://') ? fileURLToPath(importer.href) : importer.href;
                    for (const pattern of restriction.importerPatterns) { 
                        if (!this._matchPattern(from, pattern)) {
                            skipDetect = true;
                            continue;
                        }
                    }
                }
                if (skipDetect) {
                    continue;
                }
                for (const pattern of restriction.banSourcePatterns) {
                    if (this._matchPattern(resolvedId, pattern)) {
                        throw new Error(`Cannot import '${resolvedId}'${importer ? ` from '${importer.href.startsWith('file://') ? fileURLToPath(importer.href) : importer.href}'` : ''}`);
                    }
                }
            }
        }
    }

    private _followSymlinks(url: URL): URL {
        if (!isFileURL(url)) {
            return url;
        }

        if (isCjsInteropUrl(url)) {
            return url;
        }
        
        const path = fileURLToPath(url);

        let realPath = '';
        try {
            realPath = fs.realpathSync(path);
        } catch (err) {
            // If error is thrown(for example, since path does not exists).
            // We treat it as not symlinks.
            return url;
        }

        if (realPath === path) {
            return url;
        }

        const realUrl = pathToFileURL(realPath);
        return realUrl;
    }

    private async _getMtime(url: URL): Promise<MTimestamp> {
        if (url.href in this._memoryModules) {
            return this._memoryModules[url.href].mTimestamp;
        }

        if (url.href.startsWith(esmDataURIPrefix)) {
            return 0;
        }

        const filePath = tryConvertAsPath(url);
        if (filePath) {
            let sourceMtime: number;
            try {
                sourceMtime = (await fs.stat(filePath)).mtimeMs;
            } catch (err) {
                this._logger.debug(`Failed to stat file '${url}' when get mtime:` + err);
                return 0;
            }
            const uuid = this._uuidMap.get(url.href);
            if (uuid) {
                return {
                    mtime: sourceMtime,
                    uuid,
                };
            } else {
                return sourceMtime;
            }
        } else {
            // TODO: may be we should relax?
            this._logger.debug(`Failed to get mtime of ${url}: not file URL`);
            return 0;
        }
    }

    private _getLoadURL(url: URL) {
        if (url.pathname.endsWith('/')) {
            asserts(false, `Module URL shall not ends with /.`);
            return url;
        }
        const href = url.href;
        for (const [prefix, mapped] of this._loadMappings) {
            if (href === prefix) {
                return mapped;
            } else if (prefix.endsWith('/') && href.startsWith(prefix)) {
                asserts(mapped.pathname.endsWith('/'));
                return new URL(href.substr(prefix.length), mapped);
            }
        }
        return url;
    }

    private async _loadSource(url: URL) {
        if (url.href in this._memoryModules) {
            return this._memoryModules[url.href].source;
        } else if (isCjsInteropUrl(url)) {
            return getCjsInteropSource(url);
        } else if (isFileURL(url)) {
            const path = fileURLToPath(url);
            try {
                return await fs.readFile(path, 'utf8');
            } catch (err) {
                throw new FetchFileError(path, err as Error);
            }
        } else if (url.href.startsWith(esmDataURIPrefix)) {
            const encoded = url.href.slice(esmDataURIPrefix.length);
            return decodeURIComponent(encoded);
        } else {
            let detail: ConstructorParameters<typeof AccessDeniedError>[1];
            if (url.protocol === 'db:') {
                detail = {
                    type: 'unopened-db',
                    domain: url.hostname,
                };
            } else if (url.protocol === 'node:') {
                detail = {
                    type: 'unsupported-node-builtins',
                };
            }
            throw new AccessDeniedError(url.href, detail);
        }
    }

    private async _resolveUnchecked(specifier: string, from: URL, fromType: ModuleType): Promise<ResolveResult> {
        if (this._isExternal(specifier)) {
            return {
                specifierOrURL: specifier,
                isExternal: true,
            };
        }

        if (fromType === 'esm') {
            const resolved = await this._doEsmResolve(specifier, from);
            if (!resolved.isExternal) {
                const { url } = resolved;
                if (!isCjsInteropUrl(from) && await this._determinateModuleType(url) === 'commonjs') {
                    this._logger.debug(`Create cjs interop url for '${url.href}'`);
                    const cjsInteropURL = createCjsInteropUrl(url);
                    return {
                        isExternal: false,
                        url: cjsInteropURL,
                    };
                }
            }
            return resolved;
        }

        return await this._doCjsResolve(specifier, from);
    }

    private async _doEsmResolve(specifier: string, from: URL): Promise<ResolveResult> {
        const stdResolved = await esmResolve(specifier, from, {
            importMap: this._parsedImportMap,
            conditions: this._conditions,
        });

        // 对于项目脚本直接的互相导入，在标准解析的基础上，我们允许 extension-less 式的解析。
        const shouldPerformExtensionLessResolution = this._allowExtensionLessResolution(from, stdResolved);
        const extensionLessResolved = shouldPerformExtensionLessResolution
            ? await this._tryExtensionLessResolve(stdResolved, ['.ts']) ?? stdResolved
            : stdResolved;

        if (extensionLessResolved.protocol === 'file:') {
            const path = fileURLToPath(extensionLessResolved);
            const stat = await this._tryStat(path);
            if (stat.isDirectory()) {
                throw new UnsupportedDirectoryImportError();
            } else if (!stat.isFile()) {
                throw new ModuleNotFoundError(specifier, from);
            }
        }

        // Note: we do not have "post isExternal()"

        return {
            isExternal: false,
            url: extensionLessResolved,
        };
    }

    private async _tryExtensionLessResolve(url: URL, extensions: readonly string[]) {
        if (await this._fileExists(url)) {
            return url;
        }
        const baseName = url.pathname.split('/').pop();
        if (!baseName || baseName === '') {
            return undefined;
        }
        for (const extension of extensions) {
            let guess: URL;
            if (await this._fileExists(guess = new URL(`./${baseName}${extension}`, url))) {
                return guess;
            }
        }
        for (const extension of extensions) {
            let guess: URL;
            if (await this._fileExists(guess = new URL(`./${baseName}/index${extension}`, url))) {
                return guess;
            }
        }
        return undefined;
    }

    private async _doCjsResolve(specifier: string, from: URL): Promise<ResolveResult> {
        // 如果 CommonJS 模块引用了一个不是文件 URL 的 URL，那么直接算解析成功。
        // 因为这里我们要插入 `cjs-loader` 的引用。
        // TODO：或许除了 `cjs-loader` 之外其它的都应该走 legacy resolve？
        if (!isRelativeSpecifier(specifier)) {
            const url = tryParseURL(specifier);
            if (url && !hasFileProtocol(url)) {
                return {
                    isExternal: false,
                    url,
                };
            }
        }

        const resolved = await cjsResolve(specifier, from);
        if (resolved.protocol === 'node:') {
            throw new ModuleNotFoundError(specifier, from);
        }
        return {
            isExternal: false,
            url: resolved,
        };
    }

    private _isExternal(specifierOrURL: string) {
        return this._externals.includes(specifierOrURL);
    }

    private async _determinateModuleType(file: URL): Promise<ModuleType> {
        // https://nodejs.org/api/packages.html#packages_determining_module_system
        switch (true) {
            case !isFileURL(file):
            case file.pathname.endsWith('.mjs'):
            case file.pathname.endsWith('.ts'):
            default:
                return 'esm';
            case file.pathname.endsWith('.json'):
                return 'json';
            case file.pathname.endsWith('.cjs'):
                return 'commonjs';
            case file.pathname.endsWith('.js'): {
                const packageJson = await readPackageScope(file);
                if (packageJson.type === 'module') {
                    return 'esm';
                } else {
                    return 'commonjs';
                }
            }
        }
    }

    private async _tryStat(path: string) {
        try {
            return await fs.stat(path);
        } catch {
            return new fs.Stats();
        }
    }

    private async _fileExists(url: URL) {
        return (await this._tryStat(fileURLToPath(url))).isFile();
    }

    private _allowExtensionLessResolution(parent: Readonly<URL>, resolved: Readonly<URL>) {
        if (!parent.pathname.endsWith('.ts')) {
            return false;
        }
        if (this._isAssetModule(parent) && this._isAssetModule(resolved)) {
            return true;
        }
        return false;
    }

    private _isAssetModule(url: URL) {
        const href = url.href;
        return this._assetPrefixes.some((assetPrefix) => href.startsWith(assetPrefix));
    }

    private _generateCommonJsModuleId(url: URL, source: string): string {
        const hash = crypto.createHash('md5').update(source, 'utf-8').digest('hex');
        const segments = url.pathname.split('/');
        if (segments.length === 0) {
            return `${hash}`;
        } else {
            const last = segments[segments.length - 1];
            return `${hash}-${last}`;
        }
    }

    private _origin: Readonly<URL> = new URL('unspecified-origin:/');
    private _logger: Logger;
    private _transformer: Transformer;
    private _assetPrefixes: string[] = [];
    private _guessCjsExports: boolean;
    private _uuidMap: Map<string, string> = new Map();
    private _externals: Array<string> = [];
    private _loadMappings: Array<[string, URL]> = [];
    private _parsedImportMap: ParsedImportMap | undefined;
    private _memoryModules: Record<string, MemoryModule> = {};
    private _conditions: readonly string[] = [];
    private _crFilter: ModuleFilter | null = null;
    private _compressUUID: (uuid: string) => string;
    private _helperURL: URL | undefined = undefined;
    private _helperModuleMTimestamp: MTimestamp = 0;
    private _transformExcludesModuleFilter = new ModuleFilter();
    private _importMetaURLValid: boolean;
    private _checkObsolete: boolean;
    private _hot: boolean;
    private _importRestrictions?: ImportRestriction[];
    private _preserveSymlinks = false;
}

function filterModule(url: string, rule: ModuleFilterRule) {
    return typeof rule === 'string' ? url === rule : rule.test(url);
}

class ModuleFilter {
    public add(rule: ModuleFilterRule) {
        this._rules.push(rule);
    }

    public test (url: Readonly<URL>) {
        const href = url.href;
        return this._rules.some(
            (rule) => filterModule(href, rule));
    }

    private _rules: ModuleFilterRule[] = [];
}

export class AccessDeniedError extends Error {
    constructor(url: string, detail?: {
        type: 'unsupported-node-builtins',
    } | {
        type: 'unopened-db';
        domain: string;
    }) {
        let detailString = '';
        if (detail) {
            if (detail.type === 'unsupported-node-builtins') {
                detailString = i18nTranslate('modLo_access_denied_error_unsupported_node_builtins');
            } else if (detail.type === 'unopened-db') {
                detailString = i18nTranslate('modLo_access_denied_error_db_not_mounted', { domain: detail.domain });
            }
        }
        if (!detailString) {
            detailString = i18nTranslate('modLo_access_denied_error_default_reason');
        }
        super(i18nTranslate('modLo_access_denied_error', { url }) + detailString);
    }
}

export class FetchFileError extends Error {
    constructor(file: string, err: Error) {
        super(i18nTranslate('modLo_fetch_file_error', { path: file, cause: err }));
    }
}

export interface ModLoOptions {
    transformer?: 'babel' | 'swc';

    targets?: BrowsersListTargets;

    loose?: boolean;

    useDefineForClassFields?: boolean;

    allowDeclareFields?: boolean;

    looseForOf?: boolean;

    /**
     * Defaults: true;
     */
    comments?: boolean;

    exportsConditions?: string[];

    guessCommonJsExports?: boolean;

    /**
     * Tells if the `import.meta.url` is valid to access.
     */
    _importMetaURLValid?: boolean;

    /**
     * 循环引用检测选项。只会对 asset 类型的模块生效。
     */
    cr?: CircularReferenceReportOptions;

    dynamicImportVars?: boolean;

    /**
     * 内部使用。以后可能调整。
     */
    _compressUUID: (uuid: string) => string;

    _internalTransform?: InternalTransformOptions;

    transformExcludes?: Array<ModuleFilterRule>;

    /**
     * Logger.
     */
    logger?: Logger;

    /**
    * Helper 模块的 ID。
    */
    _helperModule?: string;
    /**
     * Check whether the module exported binding name is deprecated.
     */
    checkObsolete?: boolean;

    hot?: boolean;

    /**
     * This option is used to configure import restrictions for certain modules.
     * 
     * @example
     * ```ts
     * [
     *  {
     *      importerPatterns: ['A/*.ts'],
     *      banSourcePatterns: ['B/*.ts'],
     *  }
     * ]
     * ```
     * means all ts files under A directory cannot import all ts files under B directory.
     */
    importRestrictions?: ImportRestriction[];

    /**
     * Same as https://nodejs.org/api/cli.html#--preserve-symlinks .
     * @default false
     */
    preserveSymlinks?: boolean;
}

export type BrowsersListTargets = string | string[] | Record<string, string>;

export type { ImportMap };

export interface InternalTransformOptions {
    excludes?: Array<RegExp |string>;
    includes?: Array<RegExp |string>;
}

/**
 * Stamp to indicate whether the module source is expired.
 */
export type MTimestamp = number | {
    mtime: number;
    uuid: string;
};

export function isEqualMTimestamp(lhs: MTimestamp, rhs: MTimestamp) {
    if (typeof lhs !== 'object') {
        return lhs === rhs;
    } else if (typeof rhs !== 'object') {
        return false;
    } else {
        return lhs.mtime === rhs.mtime && lhs.uuid === rhs.uuid;
    }
}

export function mTimestampToString(mTimestamp: MTimestamp) {
    return typeof mTimestamp === 'object'
        ? `${new Date(mTimestamp.mtime)}@${mTimestamp.uuid}`
        : `${new Date(mTimestamp)}`;
}

export type ResolveResult = {
    isExternal: false;
    url: URL
} | {
    isExternal: true;
    specifierOrURL: string;
};

function normalizeURLArg(url: string | Readonly<URL>) {
    return typeof url === 'string' ? new URL(url) : url;
}

function assertIsURL(url: string) {
    asserts(new URL(url));
}

function isFileURL(url: URL) {
    return url.protocol === 'file:';
}

function tryConvertAsPath(url: URL): string | undefined {
    if (isCjsInteropUrl(url)) {
        return tryConvertAsPath(getCjsInteropTarget(url));
    } else if (isFileURL(url)) {
        return fileURLToPath(url);
    }
}

function createCjsInteropUrl(url: URL) {
    try {
        const result = new URL(`?cjs`, url);
        const originalExtension = replaceExtension(result, '.mjs');
        if (originalExtension) {
            result.searchParams.append('original', originalExtension);
        }
        return result;
    } catch (err) {
        throw new CjsInteropError(url, err as Error);
    }
}

function getCjsInteropSource(url: URL) {
    const target = getCjsInteropTarget(url);
    return getCjsInteropModuleSource(`./${target.pathname.split('/').pop()!}`);
}

function normalizeLoadMappings(loadMappings: Record<string, string>) {
    const normalized: Array<[string, Readonly<URL>]> = [];
    for (const [from, to] of Object.entries(loadMappings)) {
        if (!from.endsWith('/') && to.endsWith('/')) {
            throw new Error(`Bad load mapping: '${from}': '${to}'`);
        }
        const fromURL = new URL(from);
        const toURL = new URL(to);
        normalized.push([fromURL.href, toURL]);
    }
    return normalized;
}
