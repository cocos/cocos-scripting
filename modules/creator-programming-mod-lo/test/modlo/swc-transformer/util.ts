import { pathToFileURL } from "url";
import fs from 'fs-extra';
import { Mod } from "../../../src/mods";

export async function transformAndCompare0(inputPath: string, outputPath: string, getMod: (url: URL, source: string) => Promise<Mod>) {
    const inputURL = pathToFileURL(inputPath);
    const source = await fs.readFile(inputPath, { encoding: 'utf8' });
    const mod = await getMod(inputURL, source);
    const generated = await mod.module();
    if (await fs.pathExists(outputPath)) {
        const snapshot = await fs.readFile(outputPath, { encoding: 'utf8' });
        expect(snapshot).toBe(generated.code);
    } else {
        await fs.outputFile(outputPath, generated.code, { encoding: 'utf8' });
    }
}