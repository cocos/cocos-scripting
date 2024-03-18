import { CanBeTransformedIntoModule, CanBeTransformedIntoSystemJsModule, JavaScriptSource, MaybePromised } from "./common";

export interface EsmMod extends CanBeTransformedIntoModule, CanBeTransformedIntoSystemJsModule {
    type: 'esm';
    
    source(): MaybePromised<JavaScriptSource>;
}
