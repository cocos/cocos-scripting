import { SwcTransformer } from '../../../src/transformer/swc/swc-transformer';
import fs from 'fs-extra';
import ps from 'path';
import { pathToFileURL } from 'url';

test(`Perf`, async () => {
    const sourcePath = String.raw`X:\Temp\mod-lo-swc-test\input.js`;
    const sourceURL = pathToFileURL(sourcePath);
    const source = await fs.readFile(sourcePath, { encoding: 'utf8' });

    const swcTransformer = new SwcTransformer({
        loose: false,
        useDefineForClassFields: true,
        allowDeclareFields: true,
    });
    console.time(`OJBK`);
    const transformed = await swcTransformer.transform(
        sourceURL,
        source,
        undefined,
        { cr: false },
    );
    console.timeEnd(`OJBK`);
    const generated = await transformed.source();

    const outputPath = String.raw`X:\Temp\mod-lo-swc-test\output.js`;
    await fs.writeFile(outputPath, generated.code);

    {
        console.time(`OJBK`);
        const transformed2 = await transformed.systemjs();
        console.timeEnd(`OJBK`);
        const generated = transformed2.source;

        const outputPath = String.raw`X:\Temp\mod-lo-swc-test\output.system.js`;
        await fs.writeFile(outputPath, generated.code);
    }
});
