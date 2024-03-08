
export interface SourceMapOptions {
    /**
     * 目标是 Electron 5.0.9 版本。
     */
    usedInElectron509?: boolean;

    /**
     * 使用内联的 source map。
     */
    inlineSourceMap?: boolean;

    /**
     * 使用索引 source map。
     */
    indexedSourceMap?: boolean;
}
