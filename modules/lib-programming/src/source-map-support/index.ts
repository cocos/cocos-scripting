
import { MappedPosition, NullableMappedPosition, Position, RawSourceMap, SourceMapConsumer } from 'source-map';
import { URL, fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs-extra';
import ps from 'path';

/* eslint-disable consistent-return */

type PrepareStackTrace = NonNullable<ErrorConstructor['prepareStackTrace']>;

type Stack = string;

type WrappedCallSite = NodeJS.CallSite;

interface SourceMapRecord {
    map: SourceMapConsumer;
    url: URL;
}

/**
 * https://github.com/evanw/node-source-map-support/pull/253
 */
interface State {
    current: NullableMappedPosition | null;
    next: NullableMappedPosition | null;
}

/**
 * 参考 https://github.com/evanw/node-source-map-support/blob/master/source-map-support.js
 */
export class SourceMapSupport {
    install() {
        if (this._vendorPrepareStackTrace) {
            return;
        }
        this._vendorPrepareStackTrace = Error.prepareStackTrace;
        Error.prepareStackTrace =
            (...args: Parameters<PrepareStackTrace>) => this._prepareStackTrace(...args);
    }

    uninstall() {
        if (!this._vendorPrepareStackTrace) {
            return;
        }
        Error.prepareStackTrace = this._vendorPrepareStackTrace;
    }

    hasStackProperty(value: any) {
        return this._myStackProperty in value;
    }

    getStackProperty(value: any) {
        return value[this._myStackProperty] as Stack;
    }

    private _prepareStackTrace(err: Error, stackTraces: NodeJS.CallSite[]) {
        let vendorResult: any;
        if (this._vendorPrepareStackTrace) {
            // @ts-ignore
            vendorResult = this._vendorPrepareStackTrace.apply(undefined, arguments);
        } else {
            vendorResult = stackTraces.map(callSite => this._callSiteToString(callSite)).join('\n');
        }
        const myResult = this._prepareStackTracePostVendor(err, stackTraces, vendorResult);
        if (myResult) {
            return myResult;
        }
        return vendorResult;
    }

    private _prepareStackTracePostVendor(
        err: Error,
        stackTraces: NodeJS.CallSite[],
        _vendorResult: any,
    ): any {
        if (typeof err !== 'object' || err === null) {
            return;
        }

        // const wrappedCallSites: WrappedCallSite[] = [];
        // for (const callSite of stackTraces) {
        //     const wrapped = this._wrapCallSite(callSite);
        //     if (wrapped) {
        //         wrappedCallSites.push(wrapped);
        //     }
        // }
        // if (wrappedCallSites.length !== 0) {
        //     Object.defineProperty(err, this._myStackProperty, {
        //         value: wrappedCallSites,
        //         enumerable: false,
        //     });
        //     return this._formatStack(err, wrappedCallSites);
        // }
        const state: State = { current: null, next: null };
        const wrappedCallSites = stackTraces.map((callSite) => {
            const wrapped = this._tryWrapCallSite(callSite, state) ?? callSite;
            state.next = state.current;
            return wrapped;
        });
        state.current = state.next = null;
        return this._formatStack(err, wrappedCallSites);
    }

    private _formatStack(err: Error, wrappedCallSites: WrappedCallSite[]) {
        const stack = wrappedCallSites.map(callSite => `\n    at ${this._callSiteToString(callSite)}`).join('');
        return `${err.name ?? 'Error'}: ${err.message ?? ''}${stack}`;
    }

    private _tryWrapCallSite(callSite: NodeJS.CallSite, state: State) {
        try {
            return this._wrapCallSite(callSite, state);
        } catch (err) {
            console.debug(err);
            return;
        }
    }

    private _wrapCallSite(callSite: NodeJS.CallSite, state: State): WrappedCallSite | undefined {
        state.current = null;

        if (callSite.isNative()) {
            return;
        }

        // Most call sites will return the source file from getFileName(), but code
        // passed to eval() ending in "//# sourceURL=..." will return the source file
        // from getScriptNameOrSourceURL() instead
        const source = callSite.getFileName() ?? ((callSite as any).getScriptNameOrSourceURL() as string | undefined);
        if (source) {
            const line = callSite.getLineNumber()!;
            let column = callSite.getColumnNumber()! - 1;
            // Fix position in Node where some (internal) code is prepended.
            // See https://github.com/evanw/node-source-map-support/issues/36
            // Header removed in node at ^10.16 || >=11.11.0
            // v11 is not an LTS candidate, we can just test the one version with it.
            // Test node versions for: 10.16-19, 10.20+, 12-19, 20-99, 100+, or 11.11
            const noHeader = /^v(10\.1[6-9]|10\.[2-9][0-9]|10\.[0-9]{3,}|1[2-9]\d*|[2-9]\d|\d{3,}|11\.11)/;
            const headerLength = noHeader.test(process.version) ? 0 : 62;
            if (line === 1 && column > headerLength /* && !isInBrowser()*/ && !callSite.isEval()) {
                column -= headerLength;
            }

            const mappedPosition = this._mapSourcePosition({ source, line, column });
            if (mappedPosition) {
                state.current = mappedPosition;
                const wrappedCallSite = cloneCallSite(callSite);
                wrappedCallSite.getFileName = () => mappedPosition.source ?? '';
                wrappedCallSite.getLineNumber = () => mappedPosition.line ?? 0;
                wrappedCallSite.getColumnNumber = () => mappedPosition.column ? (mappedPosition.column + 1) : 0;
                const nextName = state.next?.name;
                if (nextName) {
                    wrappedCallSite.getFunctionName = () => nextName;
                }
                return wrappedCallSite;
            }
        } else if (callSite.isEval()) {
            const origin = callSite.getEvalOrigin();
            if (origin) {
                this._mapEvalOrigin(origin);
            }
        }
    }

    private _callSiteToString(callSite: WrappedCallSite) {
        let fileName;
        let fileLocation = '';
        if (callSite.isNative()) {
            fileLocation = 'native';
        } else {
            fileName = callSite.getFileName();
            if (!fileName && callSite.isEval()) {
                fileLocation = callSite.getEvalOrigin() ?? '';
                fileLocation += ', ';  // Expecting source position to follow.
            }

            if (fileName) {
                fileLocation += fileName;
            } else {
                // Source code does not originate from a file and is not native, but we
                // can still get the source position inside the source string, e.g. in
                // an eval string.
                fileLocation += '<anonymous>';
            }
            const lineNumber = callSite.getLineNumber();
            if (lineNumber !== null) {
                fileLocation += ':' + lineNumber;
                const columnNumber = callSite.getColumnNumber();
                if (columnNumber) {
                    fileLocation += ':' + columnNumber;
                }
            }
        }

        let line = '';
        const functionName = callSite.getFunctionName();
        let addSuffix = true;
        const isConstructor = callSite.isConstructor();
        const isMethodCall = !(callSite.isToplevel() || isConstructor);
        if (isMethodCall) {
            let typeName = callSite.getTypeName();
            // Fixes shim to be backward compatable with Node v0 to v4
            if (typeName === '[object Object]') {
                typeName = 'null';
            }
            const methodName = callSite.getMethodName();
            if (functionName) {
                if (typeName && functionName.indexOf(typeName) !== 0) {
                    line += typeName + '.';
                }
                line += functionName;
                if (methodName && functionName.indexOf('.' + methodName) !== functionName.length - methodName.length - 1) {
                    line += ' [as ' + methodName + ']';
                }
            } else {
                line += typeName + '.' + (methodName || '<anonymous>');
            }
        } else if (isConstructor) {
            line += 'new ' + (functionName || '<anonymous>');
        } else if (functionName) {
            line += functionName;
        } else {
            line += fileLocation;
            addSuffix = false;
        }
        if (addSuffix) {
            line += ' (' + fileLocation + ')';
        }
        return line;
    }

    private _mapSourcePosition(position: Position & { source: string }): NullableMappedPosition | undefined {
        const sourceMapRecord = this._getSourceMap(position.source);
        if (!sourceMapRecord?.map ||
            typeof sourceMapRecord.map.originalPositionFor !== 'function') {
            return;
        }

        // Resolve the source URL relative to the URL of the source map.
        // Only return the original position if a matching line was found. If no
        // matching line is found then we return position instead, which will cause
        // the stack trace to print the path and line for the compiled file. It is
        // better to give a precise location in the compiled file than a vague
        // location in the original file.
        const originalPosition = sourceMapRecord.map.originalPositionFor(position);
        if (originalPosition.source === null || originalPosition.source === 'null') {
            return;
        }

        const resolved = this._resolveUrl(originalPosition.source, sourceMapRecord.url);
        if (resolved) {
            originalPosition.source = convertFileUrlToPath(resolved) ?? resolved.href;
        }

        return originalPosition;
    }

    private _mapEvalOrigin(origin: string) {

    }

    private _getSourceMap(source: string): SourceMapRecord | undefined {
        const sourceUrl = this._resolveUrl(source);
        if (!sourceUrl) {
            return;
        }
        const { href } = sourceUrl;
        const sourceMapRecord = this._sourceMapCache[href];
        if (sourceMapRecord === undefined) {
            const fetchedSourceMap = this._fetchSourceMap(sourceUrl);
            if (!fetchedSourceMap) {
                this._sourceMapCache[href] = null;
            } else {
                const sourceMapUrl = fetchedSourceMap.url;

                // Load all sources stored inline with the source map into the file cache
                // to pretend like they are already loaded. They may not exist on disk.
                if (fetchedSourceMap.map.sourcesContent) {
                    fetchedSourceMap.map.sourcesContent.forEach((sourceContent: string, iSource: number) => {
                        if (sourceContent) {
                            const inlineSource = fetchedSourceMap.map.sources[iSource];
                            const inlineSourceUrl = this._resolveUrl(inlineSource, sourceMapUrl)?.href ?? inlineSource;
                            this._fileContentsCache[inlineSourceUrl] = sourceContent;
                        }
                    });
                }

                const sourceMapConsumer = new SourceMapConsumer(fetchedSourceMap.map);
                // @ts-ignore
                this._sourceMapCache[href] = { map: sourceMapConsumer, url: sourceMapUrl };
            }
        }
        return this._sourceMapCache[href] ?? undefined;
    }

    private _tryFetchSourceMap(source: URL) {
        try {
            return this._fetchSourceMap(source);
        } catch (err) {
            console.debug(`Failed to fetch source map for '${source}': ${err}`);
            return;
        }
    }

    private _fetchSourceMap(source: URL): undefined | { map: RawSourceMap, url: URL } {
        const sourceMappingUri = this._fetchSourceMapUrl(source);
        if (!sourceMappingUri) {
            return;
        }

        // Read the contents of the source map
        let sourceMapData: RawSourceMap;
        let sourceMapUrl: URL;
        if (reSourceMappingDataUrl.test(sourceMappingUri)) {
            // Support source map URL as a data url
            const rawData = sourceMappingUri.slice(sourceMappingUri.indexOf(',') + 1);
            sourceMapData = JSON.parse(Buffer.from(rawData, 'base64').toString());
            sourceMapUrl = source;
        } else {
            // Support source map URLs relative to the source URL
            const resolved = this._resolveUrl(sourceMappingUri, source);
            if (!resolved) {
                return;
            }
            sourceMapUrl = resolved;
            const file = this._fetchFileSync(sourceMapUrl);
            if (!file) {
                return;
            }
            sourceMapData = JSON.parse(file);
        }

        if (!sourceMapData) {
            return;
        }

        return {
            url: sourceMapUrl,
            map: sourceMapData,
        };
    }

    private _fetchSourceMapUrl(source: URL): string | undefined {
        const file = this._fetchFileSync(source);
        if (!file) {
            return;
        }

        const reg = /(?:\/\/[@#][\s]*sourceMappingURL=([^\s'"]+)[\s]*$)|(?:\/\*[@#][\s]*sourceMappingURL=([^\s*'"]+)[\s]*(?:\*\/)[\s]*$)/mg;
        // Keep executing the search to find the *last* sourceMappingURL to avoid
        // picking up sourceMappingURLs from comments, strings, etc.
        let lastMatch: RegExpMatchArray | undefined;
        let match: RegExpExecArray | null;
        while ((match = reg.exec(file))) {
            lastMatch = match;
        }

        if (!lastMatch) {
            return;
        }

        return lastMatch[1];
    }

    private _fetchFileSync(url: URL): string | undefined {
        const { href } = url;
        if (!(href in this._fileContentsCache)) {
            this._fileContentsCache[href] = this._doFetchFileSync(url) ?? null;
        }
        return this._fileContentsCache[href] ?? undefined;
    }

    private _doFetchFileSync(url: URL): string | undefined {
        let path: string;
        try {
            path = fileURLToPath(url);
        } catch (err) {
            console.warn(`${url.href} is not a valid file URL. We can only fetch source map in file system.`);
            return;
        }
        return fs.readFileSync(path, { encoding: 'utf8' });
    }

    private _resolveUrl(url: string, base?: URL): URL | undefined {
        if (ps.isAbsolute(url)) {
            try {
                return pathToFileURL(url);
            } catch { }
        }
        try {
            return new URL(url, base);
        } catch {
            return;
        }
    }

    private _sourceMapCache: Record<string, SourceMapRecord | null> = {};
    private _fileContentsCache: Record<string, string | null> = {};
    private _vendorPrepareStackTrace: undefined | PrepareStackTrace;
    private _myStackProperty = Symbol('[[Creator::stack]]');
}

// Regex for detecting source maps
const reSourceMappingDataUrl = /^data:application\/json[^,]+base64,/;

function cloneCallSite(callSite: NodeJS.CallSite): NodeJS.CallSite {
    const object: any = {};
    const names = Object.getOwnPropertyNames(Object.getPrototypeOf(callSite));
    (names as (keyof NodeJS.CallSite)[]).forEach(function (name) {
        object[name] = /^(?:is|get)/.test(name) ? function () { return callSite[name].call(callSite); } : callSite[name];
    });
    return object;
}

function convertFileUrlToPath(url: URL) {
    if (url.protocol === 'file:') {
        try {
            return fileURLToPath(url);
        } catch { }
    }
}
