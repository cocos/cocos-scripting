import type { RawSourceMap } from "source-map";
import type { URL } from "url";
import { CjsInfo } from "../cjs/detect";
import type { BrowsersListTargets } from "../mod-lo";
import { CommonJsMod } from "../mods/common-js";
import { EsmMod } from "../mods/esm";
import { JsonMod } from "../mods/json";

export type InputSourceMap = RawSourceMap | string;

export type TransformTargets = BrowsersListTargets;

export interface Transformer {
    /**
     * Transform an ESM module.
     */
    transform(url: URL, source: string, inputSourceMap: InputSourceMap | undefined, options: TransformOptions, disableTransform?: boolean): Promise<EsmMod>;

    /**
     * Transform a JSON module into ESM representation.
     */
    transformJson(url: URL, source: string, inputSourceMap: InputSourceMap | undefined): Promise<JsonMod>;

    /**
     * Transform a CommonJS module into ESM representation.
     */
    transformCommonJs(url: URL, source: string, inputSourceMap: InputSourceMap | undefined, id: string | undefined, disableTransform?: boolean): Promise<CommonJsMod>;

    /**
     * 
     */
    loadHelper(url: URL): Promise<EsmMod>
}

export interface TransformOptions {
    cr: boolean;
    annotate?: {
        baseName: string;
        compressedUUID: string;
        hot?: boolean;
    };
    checkObsolete: boolean;
}

export interface CircularReferenceReportOptions {
    moduleRequestFilter?: RegExp | Array<RegExp>;
    reporter: {
        moduleName: string;
        functionName: string;
    };
}