import { systemGlobal } from '../globals';

const errors: Record<string, unknown> = Object.create(null);

const dependencyMap: Record<string, string[]> = Object.create(null);

const importersMap: Record<string, Set<string>> = Object.create(null);

const oldDataMap: Record<string, unknown> = Object.create(null);

export function setDependencies(err: unknown, id: string, dependencies: string[]) {
    if (err) {
        errors[id] = err;
    } else {
        delete errors[id];
    }

    if (dependencies) {
        dependencyMap[id] = dependencies.slice();

        for (const dependency of dependencies) {
            let importers = importersMap[dependency];
            if (!importers) {
                importers = new Set();
                importersMap[dependency] = importers;
            }
            importers.add(id);
        }
    }
}

export function createHotMeta(id: string) {
    const hotState = getOrCreateHotState(id);
    return hotState;
}

type UpdateHandler = () => void;

type ErrorHandler = (err: unknown) => void;

type DisposeHandler = (data: any) => void;

export class HotState {
    public declare id: string;

    constructor(id: string) {
        this.id = id;
        this._dependencyUpdateHandlersMap = undefined;
        this._declinedDependencies = undefined;
        this._disposeHandlers = undefined;
        this.data = oldDataMap[id] ??= {};
    }

    public accept(errorHandler?: ErrorHandler): void;

    public accept(dependencies: string | string[], updateHandler?: UpdateHandler, errorHandler?: ErrorHandler): void;

    public accept(dependencies: string | string[] | ErrorHandler | undefined, updateHandler?: UpdateHandler, errorHandler?: ErrorHandler) {
        if (typeof dependencies === 'undefined') {
            // Self-acceptable
            this._selfAcceptable = true;
            return;
        }

        if (typeof dependencies === 'function') {
            // Self-acceptable, with error handler
            this._selfAcceptable = true;
            (this._selfErrorHandlers ??= []).push(dependencies);
            return;
        }

        const normalizedDependencies = Array.isArray(dependencies) ? dependencies : [dependencies];
        if (normalizedDependencies.length === 0) {
            return;
        }
        const dependencyUpdateHandlersMap = this._dependencyUpdateHandlersMap ??= {};
        for (const dependency of normalizedDependencies) {
            const dependencyModuleId = systemGlobal.resolve(dependency, this.id);
            const dependencyUpdateHandlers = dependencyUpdateHandlersMap[dependencyModuleId] ??= {};
            if (updateHandler) {
                (dependencyUpdateHandlers.updateHandlers ??= []).push(updateHandler);
            }
            if (errorHandler) {
                (dependencyUpdateHandlers.errorHandlers ??= []).push(errorHandler);
            }
        }
    }

    public decline(): void;

    public decline(dependencies: string[]): void;

    public decline(dependencies?: string[]) {
        if (typeof dependencies === 'undefined') {
            this._selfDeclined = true;
        } else {
            const normalizedDependencies = Array.isArray(dependencies) ? dependencies : [dependencies];
            const declinedDependencies = this._declinedDependencies ??= new Set();
            for (const dependency of normalizedDependencies) {
                const dependencyModuleId = systemGlobal.resolve(dependency, this.id);
                declinedDependencies.add(dependencyModuleId);
            }
        }
    }

    public dispose(handler: DisposeHandler) {
        (this._disposeHandlers ??= []).push(handler);
    }

    set preventHotReload (value: boolean) {
        this._preventHotReload = value;
    }

    get preventHotReload (): boolean {
        return this._preventHotReload;
    }

    get _isSelfAcceptable() {
        return this._selfAcceptable;
    }

    get _hasSelfAcceptErrorHandler() {
        return this._selfErrorHandlers?.length ?? 0 !== 0;
    }

    _invokeSelfAcceptErrorHandlers(err: unknown) {
        const { _selfErrorHandlers: selfErrorHandlers } = this;
        if (selfErrorHandlers) {
            for (const selfErrorHandler of selfErrorHandlers) {
                selfErrorHandler(err);
            }
        }
    }

    _isAcceptableDependency(dependency: string) {
        const dependencyModuleId = systemGlobal.resolve(dependency, this.id);
        const handlers = this._dependencyUpdateHandlersMap?.[dependencyModuleId];
        if (!handlers) {
            return false;
        }
        return handlers.updateHandlers?.length !== 0 || handlers.updateHandlers?.length !== 0;
    }

    _invokeDependencyUpdateHandlers(dependency: string) {
        const dependencyModuleId = systemGlobal.resolve(dependency, this.id);
        this._dependencyUpdateHandlersMap?.[dependencyModuleId]?.updateHandlers?.forEach((handler) => handler());
    }

    _invokeDependencyErrorHandlers(dependency: string, err: unknown) {
        const dependencyModuleId = systemGlobal.resolve(dependency, this.id);
        this._dependencyUpdateHandlersMap?.[dependencyModuleId]?.errorHandlers?.forEach((errorHandler) => errorHandler(err));
    }

    get _isSelfDeclined() {
        return this._selfDeclined;
    }

    _isDeclinedDependency(dependency: string) {
        const { _declinedDependencies: declinedDependencies } = this;
        if (!declinedDependencies) {
            return false;
        }
        const dependencyModuleId = systemGlobal.resolve(dependency, this.id);
        return declinedDependencies.has(dependencyModuleId);
    }

    _invokeDisposeHandlers() {
        const { _disposeHandlers: disposeHandlers, data } = this;
        if (disposeHandlers) {
            for (const disposeHandler of disposeHandlers) {
                disposeHandler(data);
            }
        }
        return this.data;
    }

    private _selfAcceptable = false;

    private _selfErrorHandlers: undefined | ErrorHandler[];

    private _dependencyUpdateHandlersMap: undefined | Record<string, {
        updateHandlers?: UpdateHandler[];
        errorHandlers?: ErrorHandler[];
    }>;

    private _selfDeclined = false;

    private _declinedDependencies: undefined | Set<string>;

    private _disposeHandlers: undefined | DisposeHandler[];

    private declare data: unknown;

    private _preventHotReload = false;
}

const hotStateMap: Record<string, HotState> = Object.create(null);

function getOrCreateHotState(id: string) {
    const existing = hotStateMap[id];
    if (existing) {
        return existing;
    } else {
        const hotState = new HotState(id);
        hotStateMap[id] = hotState;
        return hotState;
    }
}

enum ModuleChainPositionType {
    ABORT = 'abort',

    ACCEPT = 'accept',
}

type ModuleChainPosition = {
    type: ModuleChainPositionType.ABORT;
    reason: Error;
} | {
    type: ModuleChainPositionType.ACCEPT;
    workSet: ReloadWorkSet;
};

function requestModuleChainPosition(updateModuleId: string): ModuleChainPosition {
    const queue: Array<{ id: string }> = [{
        id: updateModuleId,
    }];

    const workSet = new ReloadWorkSet();

    workSet.addOutdated(updateModuleId);
    while (queue.length > 0) {
        const queueItem = queue.pop()!;
        const { id: moduleId } = queueItem;

        if (!System.has(moduleId)) {
            continue;
        }

        const hotState = getOrCreateHotState(moduleId);

        if (System.getDefaultHotReloadable()) {
            if (hotState.preventHotReload) {
                workSet.removeOutdated(moduleId);
            }
            continue;
        }

        if (hotState._isSelfAcceptable) {
            continue;
        }

        if (hotState._isSelfDeclined) {
            return {
                type: ModuleChainPositionType.ABORT,
                reason: new Error(`Aborted due to '${moduleId}' self decline.`),
            };
        }

        const importers = importersMap[moduleId];
        if (!importers || importers.size === 0) {
            // Main module(that does not accept the update)
            return {
                type: ModuleChainPositionType.ABORT,
                reason: new Error(`Aborted due to the update has propagated to the main module (which does not accept the update).`),
            };
        }

        for (const importerId of importers) {
            const importerHotState = hotStateMap[importerId];

            if (importerHotState && importerHotState._isDeclinedDependency(moduleId)) {
                return {
                    type: ModuleChainPositionType.ABORT,
                    reason: new Error(`Aborted due to '${importerId}' decline its dependency '${moduleId}'.`),
                };
            }

            // Maybe happened due to circular reference.
            // We only need to capture if a circular module occurred in
            // "outdated modules" because in a circular chain,
            // any module that accepts its dependency, the circle would be broken.
            if (workSet.hasOutdated(importerId)) {
                continue;
            }

            if (importerHotState && importerHotState._isAcceptableDependency(moduleId)) {
                workSet.addDependencyAcceptable(importerId, moduleId);
                continue;
            }

            workSet.addOutdated(importerId);
            queue.push({
                id: importerId,
            });
        }
    }

    return {
        type: ModuleChainPositionType.ACCEPT,
        workSet,
    };
}

function mergeIntoUniquely<T>(target: T[], source: T[]) {
    for (const value of source) {
        if (!target.includes(value)) {
            target.push(value);
        }
    }
}

class ReloadWorkSet {
    public outdatedModules: string[] = [];

    public acceptableModuleMap: Record<string, string[]> = {};

    public hasOutdated(id: string) {
        return this.outdatedModules.includes(id);
    }

    public addOutdated(id: string) {
        if (!this.hasOutdated(id)) {
            delete this.acceptableModuleMap[id];
            this.outdatedModules.push(id);
        }
    }

    public removeOutdated (id: string) {
        delete this.acceptableModuleMap[id];
        const idx = this.outdatedModules.indexOf(id);
        if (idx !== -1) {
            this.outdatedModules.splice(idx, 1);
        }
    }

    public addDependencyAcceptable(importer: string, dependency: string) {
        // TODO: asserts(!this.hasOutdated(importer))
        const accepts = this.acceptableModuleMap[importer] ??= [];
        if (!accepts.includes(dependency)) {
            accepts.push(dependency);
        }
    }

    public mergeInto(other: ReloadWorkSet) {
        const {
            outdatedModules,
            acceptableModuleMap,
        } = other;

        mergeIntoUniquely(this.outdatedModules, outdatedModules);

        for (const [importer, dependencies] of Object.entries(acceptableModuleMap)) {
            if (!this.outdatedModules.includes(importer)) {
                mergeIntoUniquely((this.acceptableModuleMap[importer] ??= []), dependencies);
            }
        }
    }
}

async function reloadWithWorkSet(workSet: ReloadWorkSet) {
    const {
        outdatedModules,
        acceptableModuleMap,
    } = workSet;

    const disposeCaptures = outdatedModules.map((outdatedModule) => {
        return dispose(outdatedModule);
    });

    const nOutdatedModules = outdatedModules.length;
    for (let iOutDatedModule = 0; iOutDatedModule < nOutdatedModules; ++iOutDatedModule) {
        const outdatedModule = outdatedModules[iOutDatedModule];
        await systemGlobal.import(outdatedModule);

        // Try to restore the bindings
        const disposeCapture = disposeCaptures[iOutDatedModule];
        if (disposeCapture.restore) {
            disposeCapture.restore();
        }
    }

    // Invoke accept update/error callback
    for (const [importer, dependencies] of Object.entries(acceptableModuleMap)) {
        // TODO: assert(!(importer in outdatedModules))
        const importerHotState = hotStateMap[importer];
        if (!importerHotState) {
            continue;
        }
        for (const dependency of dependencies) {
            let importError: unknown;
            let hasError = false;
            try {
                await systemGlobal.import(dependency);
            } catch (err) {
                importError = err;
                hasError = true;
            }
            if (hasError) {
                importerHotState._invokeDependencyErrorHandlers(dependency, importError);
            } else {
                importerHotState._invokeDependencyUpdateHandlers(dependency);
            }
        }
    }

    // Invoke self accept modules
    for (let iOutDatedModule = 0; iOutDatedModule < nOutdatedModules; ++iOutDatedModule) {
        const outdatedModule = outdatedModules[iOutDatedModule];
        const hotState = disposeCaptures[iOutDatedModule].hotState;
        if (!hotState) {
            continue;
        }
        if (!hotState._isSelfAcceptable) {
            continue;
        }
        try {
            // TODO: Could we skip the event if it doesn't have error handler? 
            await systemGlobal.import(outdatedModule);
        } catch (err) {
            hotState._invokeSelfAcceptErrorHandlers(err);
        }
    }
}

export async function reload(specifiers: string[]) {
    const moduleIds = specifiers.map(
        (specifier) => systemGlobal.resolve(specifier));

    const workSet = new ReloadWorkSet();

    for (const moduleId of moduleIds) {
        const moduleChainPosition = requestModuleChainPosition(moduleId);
        if (moduleChainPosition.type === ModuleChainPositionType.ABORT) {
            console.error(moduleChainPosition.reason);
            return false;
        }

        const {
            workSet: moduleChainReloadWorkSet,
        } = moduleChainPosition;

        workSet.mergeInto(moduleChainReloadWorkSet);
    }

    await reloadWithWorkSet(workSet);

    return moduleIds.length !== 0;
}

function dispose(id: string) {
    const hotState = hotStateMap[id];
    if (hotState) {
        hotState._invokeDisposeHandlers();
    }

    delete hotStateMap[id];

    return {
        restore: systemGlobal.delete(id),
        hotState,
    };
}
