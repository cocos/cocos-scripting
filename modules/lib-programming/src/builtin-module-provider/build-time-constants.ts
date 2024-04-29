export async function makeBuildTimeConstantModule(constants: Record<string, IBuildTimeConstantValue>): Promise<string> {
    return Object.entries(constants).map(([name, value]) => `export const ${name} = ${value};`).join('\n');
}

export type IBuildTimeConstantValue = string | number | boolean;

