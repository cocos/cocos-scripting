
export class LoaderContext {
    constructor(
        workspace: string,
    ) {
        this.workspace = workspace;
    }

    public workspace: string;

    public serialize(): SerializedLoaderContext {
        return {
            workspace: this.workspace,
        };
    }

    public static deserialize(serialized: SerializedLoaderContext) {
        return new LoaderContext(
            serialized.workspace,
        );
    }
}

export interface SerializedLoaderContext {
    workspace: string,
}
