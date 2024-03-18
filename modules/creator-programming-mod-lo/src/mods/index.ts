import { CommonJsMod } from "./common-js";
import { EsmMod } from "./esm";
import { JsonMod } from "./json";

export type Mod =
    | EsmMod
    | JsonMod
    | CommonJsMod
    ;
    
export type ModuleType = Mod['type'];

export {
    EsmMod,
    JsonMod,
    CommonJsMod,
};

export {
    JavaScriptSource,
    SourceMap,
    SourceLocation,
    Specifier,
    TransformResolver,
    TransformResult,
} from './common';
