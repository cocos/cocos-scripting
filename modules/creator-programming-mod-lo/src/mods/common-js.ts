import { CanBeTransformedIntoModule, CanBeTransformedIntoSystemJsModule, JavaScriptSource, MaybePromised } from "./common";

export interface CommonJsMod extends CanBeTransformedIntoModule, CanBeTransformedIntoSystemJsModule {
    type: 'commonjs';

    source(): MaybePromised<JavaScriptSource>;
}
