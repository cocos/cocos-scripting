import { transformAndCompare0 } from "./util";
import ps from 'path';
import { SwcTransformer } from "../../../src/transformer/swc/swc-transformer";
import { detectCjsInfo } from "../../../src/cjs/detect";

test(`CommonJS modules`, async () => {
    await transformAndCompare0(
        ps.join(__dirname, 'cjs', 'input.js'),
        ps.join(__dirname, 'cjs', 'output.mjs'),
        async (url, source) => {
            const swcTransformer = new SwcTransformer({
                targets: 'chrome 80',
                loose: false,
                useDefineForClassFields: true,
                allowDeclareFields: true,
            });
            return await swcTransformer.transformCommonJs(
                url,
                source,
                undefined,
            );
        },
    );
});