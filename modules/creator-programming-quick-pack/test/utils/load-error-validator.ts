import { QuickPackLoader } from "../../lib/loader";
import { LoaderContext } from "../../lib/utils/loader-context";
import { URL, pathToFileURL } from "url";
import { join } from "path";
// @ts-ignore
import { applyImportMap, System } from 'systemjs';

export class LoadErrorValidator {
    constructor(loaderContext: LoaderContext) {
        this._loader = new QuickPackLoader(loaderContext);
        this._importMapBase = pathToFileURL(join(loaderContext.workspace, '/'))
    }

    async loadOnce(url: Readonly<URL>) {
        const systemJsPrototype = System.constructor.prototype;
        const loaded: string[] = [];
        const onload = systemJsPrototype.onload;
        systemJsPrototype.onload = function(...args: [err: unknown, id: string, ...remain: unknown[]]) {
            const [_, id] = args;
            loaded.push(id);
            onload?.apply(this, args);
        };
        
        const importMap = await this._loader.loadImportMap();
        applyImportMap(System, importMap, this._importMapBase.href);
        try {
            return await System.import(url.href);
        } finally {
            for (const id of loaded) {
                System.delete(id);
            }
            systemJsPrototype.onload = onload;
        }
    }

    private _loader: QuickPackLoader;
    private _importMapBase: URL;
}