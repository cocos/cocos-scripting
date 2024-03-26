
import {
    resolveAndComposeImportMap,
    resolveImportMap,
    resolveIfNotPlainOrUrl,
    // @ts-ignore
} from '../../static/embedded-commonjs-helpers/out';
import URL from 'url';

export class EmbeddedCommonJs {
    constructor({
        importMap,
        importMapUrl,
    }: {
        importMap: any;
        importMapUrl: string;
    }) {
        resolveAndComposeImportMap(importMap, importMapUrl, this._parsedImportMap);
    }

    public addNamedWrappers(wrappers: Record<string, Wrapper>) {
        Object.assign(this._namedWrappers, wrappers);
    }

    public syncImport(id: string) {
        return this._require(id);
    }

    public resolve(id: string) {
        return this._resolve(id);
    }

    private _parsedImportMap: any = { imports: {}, scopes: {} };
    private _moduleCache: Record<string, Module> = {};
    private _namedWrappers: Record<string, Wrapper> = {};

    private _require(specifier: string, parent?: Module) {
        const id = this._resolve(specifier, parent);

        const cachedModule = this._moduleCache[id];
        if (cachedModule) {
            return cachedModule.exports;
        }

        const module: Module = { id, exports: {} };
        this._moduleCache[id] = module;
        this._tryModuleLoad(module, id);
        return module.exports;
    }

    private _resolve(specifier: string, parent?: Module): string {
        const parentUrl = parent ? parent.id : undefined;
        return resolveImportMap(
            this._parsedImportMap,
            resolveIfNotPlainOrUrl(specifier, parentUrl) || specifier,
            parentUrl,
        ) || this._throwUnresolved(specifier, parentUrl);
    }

    private _tryModuleLoad(module: Module, id: string) {
        let threw = true;
        try {
            this._load(module, id);
            threw = false;
        } finally {
            if (threw) {
                delete this._moduleCache[id];
            }
        }
    }

    private _load(module: Module, id: string) {
        const wrapper = this._loadWrapper(id);
        const require = this._createRequire(module);
        wrapper(module.exports, require, module);
    }

    private _loadWrapper(id: string) {
        if (id in this._namedWrappers) {
            return this._namedWrappers[id];
        } else {
            return this._loadExternalWrapper(id);
        }
    }

    private _loadExternalWrapper(id: string): Wrapper {
        return (exports, _require, _module) => {
            let path: string;
            try {
                path = URL.fileURLToPath(id);
            } catch (err) {
                throw new Error(`${id} is not a valid file URL`);
            }
            _module.exports = require(path);
        };
    }

    private _createRequire(module: Module) {
        return (specifier: string) => this._require(specifier, module);
    }

    private _throwUnresolved(specifier: string, parentUrl?: string) {
        throw new Error(`Unable to resolve ${specifier} from ${parent}.`);
    }
}

interface Module {
    id: string;
    exports: any;
}

type Wrapper = (exports: {}, require: (id: string) => any, _module: Module) => void;
