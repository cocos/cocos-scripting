import ps from 'path';
import fs from 'fs';
import { URL, fileURLToPath, pathToFileURL } from 'url';
import { CHUNK_HOME_RELATIVE_URL, IMPORT_MAP_RELATIVE_URL, RESOLUTION_DETAIL_MAP_RELATIVE_URL } from './constants';
import lockfile from 'proper-lockfile';

export class QuickPackMiddleware {
    constructor(workspace: string) {
        this._workspace = workspace;
        this._workspaceURL = pathToFileURL(ps.join(workspace, ps.sep));
    }

    get workspace(): string {
        return this._workspace;
    }

    get workspaceURL(): URL {
        return this._workspaceURL;
    }

    get mainRecordPath(): string {
        return ps.join(this._workspace, 'main-record.json');
    }

    get assemblyRecordPath(): string {
        return ps.join(this._workspace, 'assembly-record.json');
    }

    get chunkHomePath(): string {
        return fileURLToPath(new URL(CHUNK_HOME_RELATIVE_URL, this._workspaceURL));
    }

    get importMapPath(): string {
        return fileURLToPath(new URL(IMPORT_MAP_RELATIVE_URL, this._workspaceURL));
    }

    get resolutionDetailMapPath(): string {
        return fileURLToPath(new URL(RESOLUTION_DETAIL_MAP_RELATIVE_URL, this._workspaceURL));
    }

    public async lock (): Promise<void> {
        const filesToLock = [
            this.assemblyRecordPath,
            this.importMapPath,
        ];
        for (const file of filesToLock) {
            if (fs.existsSync(file)) {
                // NOTE: proper-lockfile will create a lock folder to mark the file as locked, and keep updating the mtime of this folder.
                // If the process throws an exception or is blocked, mtime will stop updating and the stale lock will become invalid.
                await lockfile.lock(file, { retries: {forever: true}, stale: 5000 });
                if (!this._lockedFiles.includes(file)) {
                    this._lockedFiles.push(file);
                }
            }
        }
    }

    public async unlock (): Promise<void> {
        for (const file of this._lockedFiles) {
            if (fs.existsSync(file) && await lockfile.check(file)) {
                await lockfile.unlock(file);
            }
        }
        this._lockedFiles.length = 0;
    }

    private _workspace: string;
    private _workspaceURL: URL;
    private _lockedFiles: string[] = [];
}

