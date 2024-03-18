import type { ChunkMessage } from "./utils/chunk";

export interface ResolutionDetailMap {
    [importer: string]: {
        [specifier: string]: NotableResolutionDetail;
    };
}

export interface NotableResolutionDetail {
    /**
     * The error text if this resolution issues an error.
     */
    error?: string;

    /**
     * The other messages.
     */
    messages?: ChunkMessage[];
}