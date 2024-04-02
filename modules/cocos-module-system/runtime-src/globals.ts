import type { HotState } from './hmr/hot';
import type { ModuleSystem } from './module-system/module-system';


export type ModuleId = string;
export type Module = Object;
export type ModuleMap = Record<ModuleId, Module>;

export type SystemJS = SystemJSPrototype & {
    readonly constructor: {
        readonly prototype: SystemJSPrototype;
    };
}

type Deps = string[];
type Declare = (_export?: string, _context?: Object) => {
    setters: ((ns: Object) => void)[],
    executor: () => void;
};
type Register = [Deps, Declare];

export interface ImportContext {
    url: string;
    resolve (specifier: string, parent?: string): string;
    ccHot?: HotState;
    moduleSystem?: ModuleSystem;
    /**
     * Decorator to supported to register upvalue class in module.
     * @param name the name of the class
     */
    upvalue: (name: string) => ClassDecorator;
}

type Entries = IterableIterator<[id: string, ns: Object, upvalueList?: Record<string, Object>]>;

interface SystemJSPrototype {
    has (id: string): boolean;

    delete (id: string): false | (() => void);

    entries (): Entries;

    onload (err: unknown | undefined, id: string, dependencies: string[], ...args: unknown[]): void;

    prepareImport (): Promise<void>;

    createContext (id: string): ImportContext;

    resolve (specifier: string, parent?: string): string;

    import (id: string): Promise<unknown>;

    instantiate (url: string, firstParentUrl: string): Register;

    setDefaultHotReloadable (value: boolean): void;

    getDefaultHotReloadable (): boolean;

    reload (files: string[]): Promise<boolean>;
}

declare global {
    let System: SystemJS;
}

type Imports = Record<string, string>;

export interface ImportMap {
    imports: Imports,
    scopes: Record<string, Imports>,
}

declare let $global: any;  //  $global for TAOBAO
declare let getApp: any;  // getApp for WECHAT miniprogram

const globalObj = (function getGlobalObj () {
    if (typeof $global !== 'undefined') {
        return $global;
    } else if (typeof getApp === 'function') {
        return getApp().GameGlobal;
    }
})();

export const systemGlobal = (typeof globalObj !== 'undefined' ? globalObj.System : System) as SystemJS;

export const systemJSPrototype: SystemJSPrototype = systemGlobal.constructor.prototype;
