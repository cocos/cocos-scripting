import { SwcTransformer } from '../../../src/transformer/swc/swc-transformer';
import fs from 'fs-extra';
import ps from 'path';
import { pathToFileURL } from 'url';
import { TransformTargets } from '../../../src/transformer/transformer';
import { transformAndCompare0 } from './util';

describe(`swc transformer`, () => {

    async function transformAndCompare(
        inputPath: string, outputPath: string, swcTransformerOptions: ConstructorParameters<typeof SwcTransformer>[0]) {
        await transformAndCompare0(
            inputPath,
            outputPath,
            async (url, source) => {
                const swcTransformer = new SwcTransformer(swcTransformerOptions);
                return await swcTransformer.transform(
                    url,
                    source,
                    undefined,
                    { cr: false },
                );
            },
        );
    }

    describe(`Targets`, () => {
        async function runTargetTest(inputPath: string, outputPath: string, targets: Readonly<TransformTargets>) {
            await transformAndCompare(inputPath, outputPath, {
                targets,
                loose: false,
                useDefineForClassFields: true,
                allowDeclareFields: true,
            });
        }

        test.each([
            ['string form', {
                targets: 'node 9',
            }],
            ['string[] form', {
                targets: ['node 9'],
            }],
            ['Record<string, string> form', {
                targets: { 'node': '9' }
            }],
        ] as const)(`Targets specified in different forms: %s`, async (_title, { targets }) => {
            const inputPath = ps.join(__dirname, 'targets-in-different-forms', 'input.mjs');
            const outputPath = ps.join(__dirname, 'targets-in-different-forms', 'output.mjs');
            await runTargetTest(inputPath, outputPath, targets);
        });

        test.each([
            ['defaults', {
                targets: 'defaults',
            }],
            ['chrome-80', {
                targets: ['chrome 80'],
            }],
        ] as const)(`Different targets: %s`, async (_title, { targets }) => {
            const inputPath = ps.join(__dirname, 'different-targets', 'input.mjs');
            const outputPath = ps.join(__dirname, 'different-targets', `output.${_title}.mjs`);
            await runTargetTest(inputPath, outputPath, targets);
        });
    });

    describe(`Loose`, () => {
        async function runLooseTest(inputPath: string, outputPath: string, loose: boolean) {
            await transformAndCompare(inputPath, outputPath, {
                targets: 'chrome 80',
                loose,
                useDefineForClassFields: true,
                allowDeclareFields: true,
            });
        }

        test.each([
            ['true', {
                loose: true,
            }],
            ['false', {
                loose: false,
            }],
        ] as const)(`Loose: %s`, async (_title, { loose }) => {
            const inputPath = ps.join(__dirname, 'loose', 'input.mjs');
            const outputPath = ps.join(__dirname, 'loose', `output.${_title}.mjs`);
            await runLooseTest(inputPath, outputPath, loose);
        });
    });

    test(`Probe specifiers`, async () => {
        const inputPath = ps.join(__dirname, '..', 'probe-specifiers', 'input.mjs');
        const inputURL = pathToFileURL(inputPath);
        const source = await fs.readFile(inputPath, { encoding: 'utf8' });
        const swcTransformer = new SwcTransformer({
            loose: false,
            useDefineForClassFields: true,
            allowDeclareFields: true,
        });
        const transformed = await swcTransformer.transform(
            inputURL,
            source,
            undefined,
            { cr: false },
        );
        const { moduleSpecifiers } = await transformed.systemjs();
        expect(moduleSpecifiers.map(({ value }) => value)).toEqual(expect.arrayContaining([
            'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'
        ]))
    });
});
