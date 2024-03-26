import fs from 'fs-extra';
import ps from 'path';

export async function makeBuildTimeConstantModule(constants: Record<string, IBuildTimeConstantValue>) {
    return Object.entries(constants).map(([name, value]) => `export const ${name} = ${value};`).join('\n');
}

export type IBuildTimeConstantValue = string | number | boolean;

