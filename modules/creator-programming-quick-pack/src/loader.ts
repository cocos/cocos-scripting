import { LoaderContext } from './utils/loader-context';
import { ChunkIOBase } from './utils/chunk-io/base';
import { i18nTranslate, ImportMap } from '@ccbuild/utils';
import { fileURLToPath, URL } from 'url';
import { ChunkTimestamp } from './utils/chunk';
import { QuickPackMiddleware } from './middleware';
import fs from 'fs-extra';
import { CHUNK_HOME_RELATIVE_URL, IMPORT_MAP_RELATIVE_URL, RESOLUTION_DETAIL_MAP_RELATIVE_URL } from './constants';
import { ResolutionDetailMap } from './resolution-detail-map';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface Options { }

export class ResourceNotFoundError extends Error {
    constructor(id: string) {
        super(i18nTranslate('quick_pack_loader_resource_not_found_error', { id }));
    }
}

const baseURL = new URL('pack:///') as Readonly<URL>;

export class QuickPackLoader {
    public constructor(
        context: LoaderContext,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        options: Options = {},
    ) {
        this._middleware = new QuickPackMiddleware(context.workspace);
        this._chunkReader = new ChunkIOBase({ chunkHomePath: this._middleware.chunkHomePath });
    }

    get importMapURL(): string {
        return IMPORT_MAP_RELATIVE_URL;
    }

    get resolutionDetailMapURL(): string {
        return RESOLUTION_DETAIL_MAP_RELATIVE_URL;
    }

    public async lock (): Promise<void> {
        await this._middleware.lock();
    }

    public async unlock (): Promise<void> {
        await this._middleware.unlock();
    }

    public async loadAny(url: string): Promise<{
        type: 'json';
        json: unknown;
    } | {
        type: 'chunk';
        chunk: ChunkInfo;
    }> {
        // First, normalize it
        const absolute = new URL(url, baseURL);
        absolute.search = ''; // Discard any search params

        switch (absolute.href) {
            case new URL(IMPORT_MAP_RELATIVE_URL, baseURL).href:
                return {
                    type: 'json',
                    json: await this.loadImportMap(),
                };
            case new URL(RESOLUTION_DETAIL_MAP_RELATIVE_URL, baseURL).href:
                return {
                    type: 'json',
                    json: await this.loadResolutionDetailMap(),
                };
            default:
                return {
                    type: 'chunk',
                    chunk: await this.loadChunk(url),
                };
        }
    }

    /**
     * Loads the import map.
     * @returns The import map object.
     */
    public async loadImportMap(): Promise<ImportMap> {
        return await fs.readJson(this._middleware.importMapPath);
    }

    /**
     * Loads the resolution detail map.
     * @returns The resolution detail map object.
     */
    public async loadResolutionDetailMap(): Promise<ResolutionDetailMap> {
        return await fs.readJson(this._middleware.resolutionDetailMapPath);
    }

    /**
     * Load specific chunk.
     * @param url The URL of the chunk, if relative, would be resolved from `this.baseURL`.
     * @returns The chunk info.
     */
    public async loadChunk(url: string): Promise<ChunkInfo> {
        const resourceId = this.getChunkId(url);
        return await this.loadChunkFromId(resourceId);
    }

    /**
     * Gets the opacity, unique ID of the chunk, to query timestamp or load the chunk.
     * @param url URL of the chunk.
     * @returns The chunk ID.
     */
    public getChunkId(url: string): string {
        // First, normalize it
        const absolute = new URL(url, baseURL);
        absolute.search = ''; // Discard any search params
        
        // Next, deduce a relative reference from it
        const baseHref = baseURL.href;
        const href = absolute.href;
        let normalizedReference: string = '';
        if (href.startsWith(baseHref)) {
            normalizedReference = href.slice(baseHref.length);
        }
        if (!normalizedReference) {
            throw new Error(`Bad pack resource URL: ${url}`);
        }

        return normalizedReference;
    }

    /**
     * Load specific chunk.
     * @param id The chunk ID.
     * @returns The chunk ID.
     */
    public async loadChunkFromId(id: ChunkId): Promise<ChunkInfo> {
        const file = fileURLToPath(new URL(id, this._middleware.workspaceURL));
        return {
            type: 'file',
            path: file,
        } as const;
    }

    /**
     * 获取指定资源的 mtime 时间戳。若不存在则返回负值。
     */
    public async queryTimestamp(resource: ChunkId): Promise<ChunkTimestamp> {
        return this._timestampsCache[resource] ?? -1;
    }

    /**
     * 获取指定所有资源的 mtime 时间戳。不存在的资源将返回负值。
     */
    public async queryTimestamps(resources: ChunkId[]): Promise<ChunkTimestamp[]> {
        return resources.map((resource) => this._timestampsCache[resource] ?? -1);
    }

    public async reload(): Promise<void> {
        const serializedAssemblyRecord = await fs.readJson(this._middleware.assemblyRecordPath);
        this._chunkReader.deserializeRecord(serializedAssemblyRecord);
        this._timestampsCache = Object.entries(await this._chunkReader.queryAllTimestamps()).reduce((result, [chunkRelativeURL, timestamp]) => {
            result[`${CHUNK_HOME_RELATIVE_URL}${chunkRelativeURL}`] = timestamp;
            return result;
        }, {} as Record<string, ChunkTimestamp>);
    }

    private _middleware: QuickPackMiddleware;
    private _chunkReader: ChunkIOBase;
    private _timestampsCache: Record<string, ChunkTimestamp> = {};
}

export { LoaderContext as QuickPackLoaderContext };

export type ChunkId = string;

export type { ChunkTimestamp };

export interface ChunkInfo {
    type: 'file';
    path: string;
}
