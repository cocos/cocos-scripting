import { ChunkUID } from './chunk-id';

export type ChunkTimestamp = number;

export interface Chunk {
    timestamp: ChunkTimestamp;

    imports: Record<string, ChunkResolutionDetail>;
}

export interface ChunkResolutionDetail {
    resolved: {
        type: 'chunk';
        id: ChunkUID;
    } | {
        type: 'external';
        specifierOrURL: string;
    } | {
        type: 'error';
        text: string;
    };

    messages: ChunkMessage[];
}

export interface ChunkMessage {
    level: 'log' | 'warn' | 'error';
    text: string;
}
