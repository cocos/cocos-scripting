import { MTimestamp, ResolveResult, Specifier, ModuleType } from '@cocos/creator-programming-mod-lo';
import { ChunkUID } from './chunk-id';
import { URL } from 'url';

export interface ModuleRecord {
    erroneous?: false;

    mTimestamp: MTimestamp;

    /**
     * The chunk.
     */
    chunkId: ChunkUID;

    /**
     * Imports.
     */
    imports: Specifier[];

    resolutions?: ModuleResolution[];

    type: ModuleType;
}

export interface ErroneousModuleRecord {
    erroneous: true;

    mTimestamp: MTimestamp;

    chunkId: ChunkUID;
}

export interface ModuleResolution {
    resolved: {
        type: 'module';
        url: URL;
    } | {
        type: 'external';
        specifierOrURL: string;
    } | {
        type: 'error';
        text: string;
    };

    messages: ResolutionMessage[];
}

export interface ResolutionMessage {
    level: 'log' | 'warn' | 'error';
    text: string;
}

