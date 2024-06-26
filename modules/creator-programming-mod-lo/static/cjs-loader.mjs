class CjsLoader {
    constructor() {
        this._registry = {};
        this._moduleCache = {};
    }

    /**
     * Defines a CommonJS module.
     * @param id Module ID.
     * @param factory The factory.
     * @param resolveMap An object or a function returning object which records the module specifier resolve result.
     * The later is called as "deferred resolve map" and would be invocated right before CommonJS code execution.
     */
    define(id, factory, resolveMap) {
        this._registry[id] = {
            factory,
            resolveMap,
        };
    }

    /**
     * Requires a CommonJS module.
     * @param id Module ID.
     * @returns The module's `module.exports`.
     */
    require(id) {
        return this._require(id);
    }

    throwInvalidWrapper(requestTarget, from) {
        throw new Error(`Module '${requestTarget}' imported from '${from}' is expected be an ESM-wrapped CommonJS module but it doesn't.`);
    }

    _require(id, parent) {
        const cachedModule = this._moduleCache[id];
        if (cachedModule) {
            return cachedModule.exports;
        }

        const module = { id, exports: {} };
        this._moduleCache[id] = module;
        this._tryModuleLoad(module, id);
        return module.exports;
    }

    _resolve(specifier, parent) {
        return this._resolveFromInfos(specifier, parent) || this._throwUnresolved(specifier, parent);
    }

    _resolveFromInfos(specifier, parent) {
        if (specifier in cjsInfos) {
            return specifier;
        }
        if (!parent) {
            return;
        }
        return cjsInfos[parent]?.resolveCache[specifier] ?? undefined;
    }

    _tryModuleLoad(module, id) {
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

    _load(module, id) {
        const { factory, resolveMap } = this._loadWrapper(id);
        const vendorRequire = this._createRequire(module);
        const require = resolveMap
            ? this._createRequireWithResolveMap(typeof resolveMap === 'function' ? resolveMap() : resolveMap, vendorRequire)
            : vendorRequire;
        factory(module.exports, require, module);
    }

    _loadWrapper(id) {
        if (id in this._registry) {
            return this._registry[id];
        } else {
            return this._loadHostProvidedModules(id);
        }
    }

    _loadHostProvidedModules(id) {
        return {
            factory: (_exports, _require, module) => {
                if (typeof require === 'undefined') {
                    throw new Error(`Current environment does not provide a require() for requiring '${id}'.`);
                }
                try {
                    module.exports = require(id);
                } catch (err) {
                    throw new Error(`Exception thrown when calling host defined require('${id}').`, { cause: err });
                }
            },
        };
    }

    _createRequire(module) {
        return (specifier) => this._require(specifier, module);
    }

    _createRequireWithResolveMap(requireMap, originalRequire) {
        return (specifier) => {
            const resolved = requireMap[specifier];
            if (resolved) {
                return originalRequire(resolved);
            } else {
                throw new Error('Unresolved specifier ' + specifier);
            }
        };
    }

    _throwUnresolved(specifier, parentUrl) {
        throw new Error(`Unable to resolve ${specifier} from ${parent}.`);
    }
}

export default new CjsLoader();
