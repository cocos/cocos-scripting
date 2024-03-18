import { ResolveResult } from "../../../src/mod-lo";

declare global {
    namespace jest {
        interface Matchers<R> {
            toEqualResolveResult(expected: ResolveResult): CustomMatcherResult;
        }
    }
}

expect.extend({
    toEqualResolveResult(received: ResolveResult, expected: ResolveResult): jest.CustomMatcherResult {
        let pass = true;
        if (received.isExternal !== expected.isExternal) {
            pass = false;
        } else if (received.isExternal) {
            pass = received.specifierOrURL === (expected as Extract<ResolveResult, { isExternal: true }>).specifierOrURL;
        } else {
            pass = received.url.href ===  (expected as Extract<ResolveResult, { isExternal: false }>).url.href;
        }

        return {
            pass,
            message: () => pass ? '' : this.utils.diff(received, expected) ?? '',
        };
    },
});