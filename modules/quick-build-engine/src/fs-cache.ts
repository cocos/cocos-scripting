
import fs, { Stats } from 'fs-extra';
import ps from 'path';
import { decodeRegularFilePath } from './file-uid';

export class FsCache {
    constructor(rootDir: string) {
        this._rootDir = rootDir;
    }

    public async readFile(fileUid: string) {
        const cache = this._getCache(fileUid);
        if (cache.source === undefined) {
            cache.source = fs.readFile(this._getFilePath(fileUid), { encoding: 'utf8' });
        }
        return await cache.source;
    }

    public async stat(fileUid: string) {
        const cache = this._getCache(fileUid);
        if (cache.stats === undefined) {
            cache.stats = fs.stat(this._getFilePath(fileUid));
        }
        return await cache.stats;
    }

    public async pathExists(fileUid: string) {
        const cache = this._getCache(fileUid);
        if (cache.exists === undefined) {
            cache.exists = fs.pathExists(this._getFilePath(fileUid));
        }
        return await cache.exists;
    }

    private _getCache(fileUid: string) {
        if (!(fileUid in this._cache)) {
            this._cache[fileUid] = {};
        }
        return this._cache[fileUid];
    }

    private _getFilePath(fileUid: string) {
        return ps.join(this._rootDir, decodeRegularFilePath(fileUid));
    }

    private _rootDir: string;
    private _cache: Record<string, FileInfo> = {};
}

interface FileInfo {
    stats?: Promise<Stats>;
    source?: Promise<string>;
    exists?: Promise<boolean>;
}
