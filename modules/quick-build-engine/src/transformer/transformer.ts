

export interface Transformer {
    transform(source: string, options: TransformOptions): Promise<TransformResult>;
}

export interface TransformOptions {
    fileName?: string;
    isFile: boolean;
    sourceFileName?: string;
    moduleId?: string;
    replaceModuleSpecifier?(specifier: string): string | undefined;
    isBabelHelper: boolean;
}

export interface TransformResult {
    code: string;
    map?: string;
}

export type ScriptTargets = string | string[] | Record<string, string>;