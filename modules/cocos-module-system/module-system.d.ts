
type DisposeHandler = (data: unknown) => void;
type ErrorHandler = (err: unknown, res: { moduleId: string, dependencyId: string }) => void

type ModuleId = string;
type Module = Object;
type ModuleMap = Record<ModuleId, Module>;

declare class ModuleSystem {
    set defaultHotReloadable (v: boolean);
    get defaultHotReloadable (): boolean;

    public getModules (): ModuleMap;
    public reload (modules: string[]): Promise<boolean>;
}

declare global {
    interface ImportMeta {
        upvalue(name: string): ClassDecorator;

        ccHot?: {
            data: unknown;

            get preventHotReload (): boolean;
            set preventHotReload (v: boolean);

            accept(errorHandler?: ErrorHandler): void;
            accept(
                modules: string | string[],
                callback: () => void,
                errorHandler?: ErrorHandler,
            ): void;

            
            decline(): void;
            decline(dependencies: string[]): void;

            dispose(handler: DisposeHandler): void;
        };

        moduleSystem?: ModuleSystem;
    }
}

export {};