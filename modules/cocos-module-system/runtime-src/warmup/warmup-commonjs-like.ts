
import { setBaseUrl } from './base-url';
import { extendsImportMap, setImportMap, importMap } from './import-map';
import { systemJSPrototype, ImportMap } from '../globals';

/**
 * Adapts the CommonJS like platforms such as mini-game based and jsb-based platforms.
 * 
 * These platforms have the following characteristics:
 * - They do not have a "base" URL that SystemJS used to form URL of scripts or import maps.
 * - Loading scripts is not finished through `<script>` tag.
 * 
 * This function emulates a base URL with an opaque protocol and specified `${pathname}`.
 * It accepts a handler to load scripts under such a base URL.
 * 
 * For example, an import map with `importMapUrl` been set to `import-map.json`
 * should have an simulated URL: `<protocol-that-you-do-not-care>:/import-map.json`.
 * 
 * Given that the import map has content like, for example, `{ imports: { "m": "./a/b/c.js" } }`.
 * The module `'m'` will mapped to an simulated URL: `<protocol-that-you-do-not-care>:/a/b/c.js`
 * The protocol-stripped portion of that URL(`/a/b/c.js`) will be passed to your `defaultHandler` to
 * execute the script. In most cases, the `defaultHandler` would be `(urlNoSchema) => require('.' + urlNoSchema)`.
 * 
 * This function also allow you to customize loading of scripts with specified protocol.
 * through the `handlers` parameter.
 * Handler like
 * ```js
 * { "plugin:": (urlNoSchema) => requirePlugin(urlNoSchema) }
 * ```
 * will handle the loading of scripts with URL `plugin:/a/b/c`.
 * The `urlNoSchema` passed to handler would exactly be the protocol-stripped portion of that URL: `/a/b/c`.
 * 
 * @param pathname The pathname of the opacity base URL. Default to `'/'`.
 * @param importMap Import map.
 * @param importMapUrl Relative url to import map.
 * @param defaultHandler Load urls with no protocol specified. Can returns a promise.
 * The `System.register()` must have been called:
 * - when the handler returns if it returns non-promise, or
 * - **at the time** the promise get resolved, if it returns promise.
 * For example, either:
 * - `require(urlNoSchema)`; return;
 * - `return import(urlNoSchema)`;
 * - or `return new Promise((resolve) => resolve(require(urlNoSchema)));`
 * As a comparison, `Promise.resolve(require(urlNoSchema))` might incorrect since
 * before the promise get resolved, handlers that process other URLs may be invoked.
 * @param handlers Load urls with specified protocol.
 */

type SchemaHandler = (urlNoSchema: string) => Promise<void> | any;

interface WarmupOptions {
    pathname: string,
    importMap: ImportMap,
    importMapUrl: string,
    importMapList: Array< { location: string, map: ImportMap }>,
    defaultHandler: SchemaHandler,
    handlers: Record<string, SchemaHandler>,
}

export default function({
    pathname = '/',
    importMap,
    importMapUrl,
    importMapList,
    defaultHandler,
    handlers,
}: WarmupOptions) {
    const baseUrlSchema = 'no-schema:';
    setBaseUrl(`${baseUrlSchema}${pathname}`);

    if (importMapUrl && importMap) {
        setImportMap(importMap, `${baseUrlSchema}/${importMapUrl}`);
    }

    if (Array.isArray(importMapList)) {
        for (const e of importMapList) {
            extendsImportMap(e.map, e.location);
        }
    }

    if (defaultHandler) {
        hookInstantiationOverSchema(baseUrlSchema, wrapHandler(defaultHandler));
    }

    if (handlers) {
        for (const protocol of Object.keys(handlers)) {
            hookInstantiationOverSchema(protocol, wrapHandler(handlers[protocol]));
        }
    }
}

function isThenable(value: any) {
    // https://stackoverflow.com/a/53955664/10602525
    return Boolean(value && typeof value.then === 'function');
}

function foundKeyByValueInImportMap(value: string) {
    const imports: any = importMap.imports;
    for (const k in imports) {
        const v = imports[k];
        if (v && (value === v || `no-schema:/${value}` === v)) {
            return k;
        }
    }
    return null;
}

function tryGetRegister(context: any, urlNoSchema: string) {
    let ret;
    let registerKey = urlNoSchema;
    if (registerKey.startsWith('/')) {
        registerKey = registerKey.slice(1);
    }

    const key = foundKeyByValueInImportMap(registerKey);
    if (key) {
        registerKey = key;
    }

    if (context.registerRegistry && (ret = context.registerRegistry[registerKey])) {
        context.registerRegistry[registerKey] = null;
    }
    return ret;
}

/**
 * Returns a SystemJS instantiation hook which calls `handler` and get the register.
 */
function wrapHandler(handler: Function) {
    return function(urlNoSchema: string) {
        // @ts-ignore
        const context = this;

        const register = tryGetRegister(context, urlNoSchema);
        if (register) {
            return register;
        }

        let retVal: any;
        try {
            retVal = handler(urlNoSchema);
        } catch (err) {
            return Promise.reject(err);
        }
        if (!isThenable(retVal)) {
            return context.getRegister();
        } else {
            // We can not directly `return Promise.resolve(retVal)`
            // since once we get the returns, the `System.register()` should have been called.
            // If it's synchronized, `Promise.resolve()` defers the `this.getRegister()`
            // which means other `System.register()` may happen before we resolved the promise.
            return new Promise((resolve) => {
                return retVal.then(() => {
                    resolve(context.getRegister());
                });
            });
        }
    };
}

function hookInstantiationOverSchema(schema: string, hook: Function) {
    const venderInstantiate = systemJSPrototype.instantiate;
    systemJSPrototype.instantiate = function(url: string, firstParentUrl: string) {
        const schemaErased = url.substr(0, schema.length) === schema ?
            url.substr(schema.length) : null;
        return schemaErased === null ?
            venderInstantiate.call(this, url, firstParentUrl) :
            hook.call(this, schemaErased, firstParentUrl);
    };
}
