
import fs from 'fs-extra';
import ps from 'path';
import { decodeRegularFilePath, decodeVirtualFileUid, isVirtualFileUid } from './file-uid';
import { URL, pathToFileURL } from 'url';
import { encodeUrlAsFilePath } from './utilts';

export class CacheTransformed {
    constructor({
        cacheDir,
    }: {
        cacheDir: string;
    }) {
        this._cacheDir = cacheDir;
    }

    public async store(path: string, code: string, map?: string) {
        const realPath = this.getOutFilePath(path);
        await fs.ensureDir(ps.dirname(realPath));
        await Promise.all([
            await fs.writeFile(realPath, code, { encoding: 'utf8' }),
            map ? await fs.writeFile(`${realPath}.map`, map.toString(), { encoding: 'utf8' }) : undefined,
        ]);
    }

    public async isOutFileValid(fileUid: string) {
        return await fs.pathExists(this.getOutFilePath(fileUid));
    }

    public getOutFileUrl(fileUid: string) {
        return pathToFileURL(this.getOutFilePath(fileUid)).href;
    }

    public async serialize() {
        return;
    }

    public async deserialize(json: any) {
    }

    protected get cacheDir() {
        return this._cacheDir;
    }

    protected async forEachModule(visitor: (
        path: string,
        code: string | Buffer,
        map?: any,
        mapURL?: URL,
        ) => Promise<void>) {

        const visitRecursive = async (dir: string, prefix: string, visitor: (file: string, prefix: string) => Promise<void>) => {
            return await Promise.all((await fs.readdir(dir)).map(async (fileName) => {
                const file = ps.join(dir, fileName);
                const stat = await fs.stat(file);
                const filePrefix = prefix ? `${prefix}/${fileName}` : fileName;
                if (stat.isDirectory()) {
                    await visitRecursive(file, filePrefix, visitor);
                } else {
                    await visitor(file, filePrefix);
                }
            }));
        };

        await visitRecursive(this._cacheDir, '', async (file, prefix) => {
            if (file.toLowerCase().endsWith('.js')) {
                const mapPath = `${file}.map`;
                const [code, map] = await Promise.all([
                    fs.readFile(file),
                    fs.readJson(mapPath).catch(() => undefined),
                ]);
                await visitor(prefix, code, map, map ? pathToFileURL(mapPath) : undefined);
            }
        });
    }

    protected getRelativeOutputPath(fileUid: string) {
        let relative: string;
        if (isVirtualFileUid(fileUid)) {
            const encodedName = encodeUrlAsFilePath(decodeVirtualFileUid(fileUid));
            relative = ps.join('virtual', encodedName.startsWith('.js') ? encodedName : `${encodedName}.js`);
        } else {
            relative = ps.join('fs', transformOutputExtension(decodeRegularFilePath(fileUid)));
        }
        return relative;
    }

    protected getOutFilePath(fileUid: string) {
        return ps.join(this._cacheDir, this.getRelativeOutputPath(fileUid));
    }

    private _cacheDir: string;
}

function transformOutputExtension(file: string) {
    const lower = file.toLowerCase();
    if (lower.endsWith('.json')) {
        return `${file.substr(0, file.length - 5)}.js`;
    } else if (lower.endsWith('.ts')) {
        return `${file.substr(0, file.length - 3)}.js`;
    } else {
        return file;
    }
}