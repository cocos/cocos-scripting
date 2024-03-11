

export class VirtualModules {
    public has(name: string): boolean {
        return name in this._sources;
    }

    public get(name: string): string {
        const source = this._sources[name];
        if (typeof source === 'function') {
            return this._sources[name] = source();
        } else {
            return source;
        }
    }

    public set(name: string, source: string | (() => string)): void {
        this._sources[name] = source;
    }

    private _sources: Record<string, string | (() => string)> = {};
}
