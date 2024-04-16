
import { systemGlobal, systemJSPrototype } from '../../runtime-src/globals';
import { VirtualModules } from './virtual-modules';
import { reload } from '../../runtime-src/hmr';

export class Env {
    private static _nextDomain = 0;

    private static _envMap: Record<string, Env> = {};

    public static _getEnv(domain: string): Env | undefined {
        return this._envMap[domain];
    }

    constructor() {
        this._domain = `${Env._nextDomain++}`;
        const virtualModules = new VirtualModules();
        this._virtualModules = virtualModules;
        Env._envMap[this._domain] = this;
    }

    get root(): string {
        return `vm://${this._domain}/`;
    }

    get virtualModules(): VirtualModules {
        return this._virtualModules;
    }

    public vmURL(literals: TemplateStringsArray): string {
        return new URL(literals[0], this.root).href;
    }

    public async importVirtualModule(id: string) {
        return await systemGlobal.import(new URL(id, this.root).href);
    }

    public async reloadVirtualModules(modules: string[]) {
        return await reload(modules.map(id => new URL(id, this.root).href));
    }

    public injectModuleMeta(injector: Injector): void {
        this._injector = injector;
    }

    public _injector: Injector | null = null;

    private _domain: string;

    private _virtualModules: VirtualModules;
}

type Injector = (id: string) => Record<string, unknown>;

const VM_URL_PREFIX = 'vm:/';

function tryExtractVMComponents(url: string) {
    if (!url.startsWith(VM_URL_PREFIX)) {
        return null;
    }

    let vmURL: URL;
    try {
        vmURL = new URL(url);
    } catch {
        return null;
    }

    const domain = vmURL.host;
    const env = Env._getEnv(domain);
    if (!env) {
        throw new Error(`Unknown env: ${domain}`);
    }

    const pathname = vmURL.pathname;
    const vmId = pathname.startsWith('/') ? pathname.slice(1) : pathname;

    return {
        env,
        domain,
        vmId,
    };
}

const vendorInstantiate = systemJSPrototype.instantiate;
systemJSPrototype.instantiate = function instantiate(...args: [string, string | undefined, ...unknown[]]) {
    const [url, _firstParentUrl] = args;

    const vmComponents = tryExtractVMComponents(url);
    if (!vmComponents) {
        // @ts-ignore
        return vendorInstantiate.apply(this, args);
    }

    const { env, vmId, domain } = vmComponents;

    const source = env.virtualModules.get(vmId);
    if (!source) {
        throw new Error(`File not found: ${vmId}@${domain}`);
    }

    new Function('System', `${source}\n//# sourceURL=${url}`)(systemGlobal);

    // @ts-ignore
    return this.getRegister();
};

const vendorCreateContext = systemJSPrototype.createContext;
systemJSPrototype.createContext = function(...args: [string]) {
    const [url] = args;
    const vendorResult = vendorCreateContext.apply(this, args);

    const vmComponents = tryExtractVMComponents(url);
    if (!vmComponents) {
        return vendorResult;
    }

    const { env, vmId } = vmComponents;
    if (!env._injector) {
        return vendorResult;
    }

    return {
        ...vendorResult,
        ...env._injector(vmId),
    };
};

export {};
