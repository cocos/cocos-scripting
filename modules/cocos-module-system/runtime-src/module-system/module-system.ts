import type { SystemJS, ModuleMap } from '../globals';

declare let System: SystemJS;

let iterator = typeof Symbol !== 'undefined' && Symbol.iterator;

export class ModuleSystem {

    private constructor () {
        // private constructor
    }

    set defaultHotReloadable (v: boolean) {
        System.setDefaultHotReloadable(v);
    }

    get defaultHotReloadable (): boolean {
        return System.getDefaultHotReloadable();
    }

    static getInstance () {
        if (!this._inst) {
            this._inst = new ModuleSystem();
        }
        return this._inst;
    }

    public getModules (): ModuleMap  {
        let map: ModuleMap = {};
        let entries = System.entries();
        for (let entry of entries) {
            const [id, ns, upvalueList] = entry;
            const module = map[id] ??= {};
            Object.assign(module, ns);
            if (upvalueList) {
                Object.assign(module, upvalueList);
            }
        }
        return map;
    }
    
    public reload (modules: string[]): Promise<boolean> {
        return System.reload(modules);
    }

    private static _inst: ModuleSystem;
}