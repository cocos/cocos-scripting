import ts from 'typescript';
import ps from 'path';
import fs from 'fs-extra';

export interface ModuleResolverOptions {
    rootDir: string;
}

export interface ResolvedModule {
    file: string;
    isExternal: boolean;
}

export class ModuleResolver {
    public constructor(options: ModuleResolverOptions) {
        this._rootDir = options.rootDir;
        const { compilerOptions } = readTSConfig(this._rootDir);
        this._compilerOptions = compilerOptions;
        this._moduleResolutionHost = {
            fileExists: ts.sys.fileExists,
            readFile: ts.sys.readFile,
        };
        this._moduleResolutionCache = ts.createModuleResolutionCache(
            this._rootDir,
            (s: string) => ps.normalize(s),
            compilerOptions,
        );
    }

    public async resolve(specifier: string, fromFile: string) {
        const resolveResult = ts.resolveModuleName(
            specifier,
            fromFile,
            this._compilerOptions,
            this._moduleResolutionHost,
            this._moduleResolutionCache,
            undefined
        );
        const { resolvedModule } = resolveResult;
        if (!resolvedModule) {

            const hackJSONPath = ps.join(ps.dirname(fromFile), `${specifier}.json`);
            if (await fs.pathExists(hackJSONPath)) {
                return { file: hackJSONPath, isExternal: false };
            }

            return null;
        } else {
            if (resolvedModule.resolvedFileName.toLocaleLowerCase().endsWith('.d.ts')) {
                const resolvedFileNameJs = resolvedModule.resolvedFileName.substr(resolvedModule.resolvedFileName.length - 5) + '.js';
                if (await fs.pathExists(resolvedFileNameJs)) {
                    resolvedModule.resolvedFileName = resolvedFileNameJs;
                }
            }
            return {
                file: resolvedModule.resolvedFileName,
                isExternal: !!resolvedModule.isExternalLibraryImport,
            };
        }
    }

    public resolveSync(specifier: string, fromFile: string) {
        const resolveResult = ts.resolveModuleName(
            specifier,
            fromFile,
            this._compilerOptions,
            this._moduleResolutionHost,
            this._moduleResolutionCache,
            undefined
        );
        const { resolvedModule } = resolveResult;
        if (!resolvedModule) {

            const hackJSONPath = ps.join(ps.dirname(fromFile), `${specifier}.json`);
            if (fs.pathExistsSync(hackJSONPath)) {
                return { file: hackJSONPath, isExternal: false };
            }

            return null;
        } else {
            if (resolvedModule.resolvedFileName.toLocaleLowerCase().endsWith('.d.ts')) {
                const resolvedFileNameJs = resolvedModule.resolvedFileName.substr(0, resolvedModule.resolvedFileName.length - 5) + '.js';
                if (fs.pathExistsSync(resolvedFileNameJs)) {
                    resolvedModule.resolvedFileName = resolvedFileNameJs;
                }
            }
            return {
                file: resolvedModule.resolvedFileName,
                isExternal: !!resolvedModule.isExternalLibraryImport,
            };
        }
    }

    private _rootDir: string;
    private _compilerOptions: ts.CompilerOptions;
    private _moduleResolutionHost: ts.ModuleResolutionHost;
    private _moduleResolutionCache: ts.ModuleResolutionCache;
}

export function replaceWithOutputExtension(url: string) {
    const map: Record<string, string> = {
        '.d.ts': '.js',
        '.ts': '.js',
    };
    const urlLowercase = url.toLowerCase();
    for (const k of Object.keys(map)) {
        if (urlLowercase.endsWith(k)) {
            return `${url.substr(0, url.length - k.length)}${map[k]}`
        }
    }
    return url;
}

function readTSConfig(baseDir: string) {
    const tsConfigFile = ts.findConfigFile(baseDir, ts.sys.fileExists);
    if (!tsConfigFile) {
        throw new Error(`Can not find tsconfig at ${baseDir}.`);
    }

    const tsConfig = ts.readConfigFile(tsConfigFile, ts.sys.readFile);
    if (!tsConfig.config) {
        throw new Error(`Failed to read tsconfig ${tsConfigFile}`);
    }

    const parseConfigHost: ts.ParseConfigHost = {
        useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
        readFile: ts.sys.readFile,
        readDirectory: ts.sys.readDirectory,
        fileExists: ts.sys.fileExists,
    };

    const parsedCommandLine = ts.parseJsonConfigFileContent(
        tsConfig.config,
        parseConfigHost,
        baseDir
    );

    return {
        compilerOptions: parsedCommandLine.options,
    }
}
