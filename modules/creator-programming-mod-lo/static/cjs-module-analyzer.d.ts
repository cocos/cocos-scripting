
export function analyzeCommonJS(source: string, name?: string): {
    requires: string[];
    exports: string[];
    reexports: string[];
};