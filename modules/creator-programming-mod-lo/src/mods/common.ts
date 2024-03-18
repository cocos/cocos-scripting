import { RawSourceMap } from "source-map";

export type MaybePromised<T> = T | Promise<T>;

export interface JavaScriptSource {
    readonly code: string;

    readonly map: undefined | SourceMap;
}

export type SourceMap = string | RawSourceMap;

export type TransformResolver = (specifier: string) => string | undefined;

export interface LineColumn {
    line: number;
    column: number;
}

export interface SourceLocation {
    start: LineColumn;
    end: LineColumn;
}

export interface Specifier {
    value: string;
    resolved?: string;
    loc?: SourceLocation;
}

export interface TransformResult {
    source: JavaScriptSource;
    moduleSpecifiers: Specifier[];
}

export interface CanBeTransformedIntoSystemJsModule {
    systemjs(resolver?: TransformResolver): MaybePromised<TransformResult>;
}

export interface CanBeTransformedIntoModule {
    module(): MaybePromised<JavaScriptSource>;
}