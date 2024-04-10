import { SourceMap } from '@cocos/creator-programming-mod-lo';
import { ChunkIOBase } from './base';
import ps from 'path';
import fs from 'fs-extra';
import { ChunkUID } from '../chunk-id';
import { Logger } from '@cocos/creator-programming-common';
import { asserts, ImportMap } from '@ccbuild/utils';
import { URL, fileURLToPath, pathToFileURL } from 'url';
import RelateUrl from 'relateurl';
import crypto from 'crypto';
import { ResolutionDetailMap } from '../../resolution-detail-map';

const {
    QUICK_PACK_TEST_MODULE_URL_HASH_TRANSFORMER
} = (globalThis as {
    QUICK_PACK_TEST_MODULE_URL_HASH_TRANSFORMER?: (url: string) => string;
});

export class ChunkWriter extends ChunkIOBase {
    constructor({
        chunkHomePath: sourceCacheDir,
        importMapPath,
        resolutionDetailMapPath,
        logger,
    }: {
        chunkHomePath: string;
        importMapPath: string;
        resolutionDetailMapPath: string;
        logger: Logger,
    }) {
        super({ chunkHomePath: sourceCacheDir });
        this._logger = logger;
        this._importMapPath = importMapPath;
        this._resolutionDetailMapPath = resolutionDetailMapPath;
    }

    public async persist() {
        await this._writeMaps();
    }

    public async clear() {
        const importMapPath = this._importMapPath;
        try {
            await fs.unlink(importMapPath);
        } catch (err) {
            this._logger.debug(`Failed to delete import map at ${importMapPath}: ${err}`);
        }
        await super.clear();
    }

    public async getChunk(id: ChunkUID) {
        return this._build.chunks[id];
    }

    public async addChunk(moduleURL: Readonly<URL>, code: string, map?: SourceMap) {
        const chunkId = this._generateChunkId(moduleURL, code);

        const chunkCodeFilePath = this._calculateChunkCodeFileName(chunkId);

        const timestamp = Date.now();
        this._build.chunks[chunkId] = {
            imports: {},
            timestamp,
        };

        // const metadataCacheFile = this._getMetadataCacheFile(qpLocation);
        let sourceMappingURL: string | undefined;
        let serializedMap: string | undefined;
        if (map) {
            serializedMap = typeof map === 'string'
                ? map
                : JSON.stringify(map);
            sourceMappingURL = `${ps.basename(chunkCodeFilePath)}.map`;
        }
        const codeWithMap = sourceMappingURL
            ? `${code}\n//# sourceMappingURL=${sourceMappingURL}`
            : code;
        await Promise.all([
            // Write metadata
            // fs.outputFile(metadataCacheFile, JSON.stringify(metadata, undefined, 2), { encoding: 'utf8' }),
            // Write code
            fs.outputFile(chunkCodeFilePath, codeWithMap, { encoding: 'utf8' }),
            // Write map
            serializedMap
                ? fs.outputFile(`${chunkCodeFilePath}.map`, serializedMap, { encoding: 'utf8' })
                : undefined,
        ]);

        return chunkId;
    }

    public async removeChunk(id: ChunkUID) {
        delete this._build.chunks[id];
    }

    public setEntryChunks(entryChunks: Record<ChunkUID, string>) {
        this._build.entries = entryChunks;
    }

    private _logger: Logger;
    private _importMapPath: string;
    private _resolutionDetailMapPath: string;

    private _generateChunkId(moduleURL: Readonly<URL>, code: string) {
        const shasum = crypto.createHash('sha1');
        
        let hashInput = moduleURL.href;
        if (typeof QUICK_PACK_TEST_MODULE_URL_HASH_TRANSFORMER === 'function') {
            hashInput = QUICK_PACK_TEST_MODULE_URL_HASH_TRANSFORMER(hashInput);
        }
        shasum.update(hashInput);

        const hash = shasum.digest('hex');
        asserts(hash.length === 40);
        return hash;
    }

    private async _writeMaps() {
        const importMapFileURL = pathToFileURL(this._importMapPath);
        const resolutionDetailMapFileURL = pathToFileURL(this._resolutionDetailMapPath);

        const {
            importMap,
            resolutionDetailMap: resolutionDetailMap,
        } = this._buildMaps(importMapFileURL, resolutionDetailMapFileURL);

        await fs.outputJson(
            fileURLToPath(importMapFileURL),
            importMap,
            { spaces: 2, encoding: 'utf8', }
        );
        await fs.outputJson(
            fileURLToPath(resolutionDetailMapFileURL),
            resolutionDetailMap,
            { spaces: 2, encoding: 'utf8', }
        );
    }

    private _buildMaps(importMapFileURL: URL, resolutionDetailMapFileURL: URL) {
        const {
            chunks,
            entries,
        } = this._build;

        const resolutionDetailMap: ResolutionDetailMap = {};

        const importMapRelate = new RelateUrl(importMapFileURL.href);
        const resolutionDetailMapRelate = new RelateUrl(resolutionDetailMapFileURL.href);

        const getChunkRelativePathFromImportMap = (chunkId: string): string => {
            // Can happen when reload A -> B
            // A is unchanged, but can not load B(since `forceAll: true`)
            // A's dep records are not clear
            asserts(chunkId in chunks, 'Something went wrong: module A depends on B, but B is not correctly generated.');
            const chunkSourceFile = this._calculateChunkCodeFileName(chunkId);
            const relativePath = importMapRelate.relate(pathToFileURL(chunkSourceFile).href);
            return `./${relativePath}`;
        };

        const getChunkRelativePathFromResolutionDetailMap = (chunkId: string): string => {
            // Can happen when reload A -> B
            // A is unchanged, but can not load B(since `forceAll: true`)
            // A's dep records are not clear
            asserts(chunkId in chunks, 'Something went wrong: module A depends on B, but B is not correctly generated.');
            const chunkSourceFile = this._calculateChunkCodeFileName(chunkId);
            const relativePath = resolutionDetailMapRelate.relate(pathToFileURL(chunkSourceFile).href);
            return `./${relativePath}`;
        };

        const importMap: ImportMap = {
            imports: {},
            scopes: {},
        };
        const imports = importMap.imports;
        const involvedModules: string[] =[];
        for (const [alias, chunkId] of Object.entries(entries)) {
            imports![alias] = getChunkRelativePathFromImportMap(chunkId);
            involvedModules.unshift(chunkId);
        }

        const scopes = importMap.scopes!;
        const visited = new Set<string>();
        while (involvedModules.length !== 0) {
            const chunkId = involvedModules.pop()!;
            if (visited.has(chunkId)) {
                continue;
            }
            visited.add(chunkId);
            if (!(chunkId in chunks)) {
                this._logger.debug(`Chunk ${chunkId} is absent. Skipped it.`);
                continue;
            }
            const chunk = chunks[chunkId];
            const importsEntries = Object.entries(chunk.imports);
            if (importsEntries.length === 0) {
                continue;
            }
            const chunkPathFromImportMap = getChunkRelativePathFromImportMap(chunkId);
            const specifierMap: Record<string, string> = scopes[chunkPathFromImportMap] = {};
            const chunkPathFromResolutionDetailMap = getChunkRelativePathFromResolutionDetailMap(chunkId);
            for (const [specifier, { resolved, messages }] of importsEntries) {
                const getOrCreateResolutionDetail = () => (resolutionDetailMap[chunkPathFromResolutionDetailMap] ??= {})[specifier] ??= {};

                if (resolved.type === 'chunk') {
                    specifierMap[specifier] = getChunkRelativePathFromImportMap(resolved.id);
                    involvedModules.push(resolved.id);
                } else if (resolved.type === 'external') {
                    specifierMap[specifier] = resolved.specifierOrURL;
                } else if (resolved.type === 'error') {
                    getOrCreateResolutionDetail().error = resolved.text;
                }

                if (messages.length !== 0) {
                    getOrCreateResolutionDetail().messages = messages.slice();
                }
            }
        }

        return {
            importMap,
            resolutionDetailMap,
        };
    }
}
