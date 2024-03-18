import { CanBeTransformedIntoModule, CanBeTransformedIntoSystemJsModule, JavaScriptSource, MaybePromised } from "./common";

export interface JsonMod extends CanBeTransformedIntoModule, CanBeTransformedIntoSystemJsModule {
    type: 'json';

    content(): MaybePromised<string>;
}
