

export enum Stage {
    /**
     * 编译阶段。
     */
    transform,

    /**
     * 处理外部依赖。
     */
    external,

    /**
     * 打包。
     */
    bundle,
}

export interface TransformStageMessage {
    stage: Stage.transform;

    /**
     * 总共多少个模块在编译。
     */
    total: number;

    /**
     * 已完成多少个模块的编译。
     */
    progress: number;

    /**
     * 触发 `total` 更新的文件。
     */
    file: string;
}

export interface ExternalStageMessage {
    stage: Stage.external,
}

export interface BundleStageMessage {
    stage: Stage.bundle,
}

export type ProgressMessage = TransformStageMessage | ExternalStageMessage | BundleStageMessage;

