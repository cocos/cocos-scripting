import { fileURLToPath, pathToFileURL, URL } from 'url';
import ps from 'path';
import fs from 'fs-extra';
import { Chunk } from '../chunk';
import { ChunkUID } from '../chunk-id';

export class ChunkIOBase {
    constructor({
        chunkHomePath,
    }: {
        chunkHomePath: string;
    }) {
        this._chunkHomeURL = pathToFileURL(chunkHomePath + ps.sep);
    }

    public serializeRecord(): unknown {
        return this._build;
    }

    public deserializeRecord(json: unknown) {
        this._build = json as ChunkIOBase['_build'];
    }

    protected async clear() {
        try {
            await fs.remove(fileURLToPath(this._chunkHomeURL));
        } catch (err) {
        }
    }

    protected _calculateChunkCodeFileName(chunkId: string) {
        return fileURLToPath(new URL(this.calculateChunkCodeFileRelativePath(chunkId), this._chunkHomeURL));
    }

    public calculateChunkCodeFileRelativePath(chunkId: string) {
        return `${chunkId.slice(0, 2)}/${chunkId}.js`;
    }

    public async queryAllTimestamps() {
        const result: Record<string, number> = {};
        for (const [chunkId, { timestamp }] of Object.entries(this._build.chunks)) {
            const relativePath = this.calculateChunkCodeFileRelativePath(chunkId);
            result[relativePath] = timestamp;
        }
        return result;
    }

    private _chunkHomeURL: URL;

    protected _build: {
        chunks: Record<ChunkUID, Chunk>;
        entries: Record<string, ChunkUID>;
    } = {
        chunks: {},
        entries: {},
    };
}
