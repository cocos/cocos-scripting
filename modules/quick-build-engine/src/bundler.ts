import { SourceMapOptions } from './source-map-options';

export enum TransformTargetModule {
    esm,
    commonJs,
    systemJs,
    systemJsNamed,
    umd,
}

export interface IBundler {
    targetMode?: TransformTargetModule;

    getModuleId?(path: string): string;

    isOutFileValid(path: string): Promise<boolean>;

    store(path: string, code: string, map?: any): Promise<void>;

    getOutFileUrl(path: string): string;

    getFinalUrl(path: string): string | {
        path: string;
    };

    build(options: {
        outDir: string;
        sourceRoot: string;
    } & SourceMapOptions): Promise<void>;

    serialize(): Promise<any>;

    deserialize(json: any): Promise<void>;
}
