import * as babel from '@babel/core';

export class VirtualModules {
    public get(id: string): string | undefined {
        return this._files[id];
    }

    public add(id: string, source: string) {
        const { code } = babel.transformSync(source, { plugins: ['@babel/plugin-transform-modules-systemjs'] })!;
        this._files[id] = code!;
    }

    public delete(id: string) {
        delete this._files[id];
    }

    private _files: Record<string, string> = {};
}
