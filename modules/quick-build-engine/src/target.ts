import ps from 'path';
import type { IBundler } from './bundler';
import type { FileRecord } from './file-record';
import { decodeRegularFilePath, FileUid, isVirtualFileUid } from './file-uid';
import { FsCache } from './fs-cache';

export interface TargetRecord {
    files: Record<FileUid, FileRecord>;
    /**
     * 键值是依赖文件 Id。
     */
    externalDependencies: Record<string, string>;

    /**
     * 外部依赖所牵扯到的所有文件以及它们的时间戳。
     * 键是依赖文件 Id。
     */
    externalDependencyWatchFiles: Record<string, number>;

    externalDependencyImportMap: Record<string, string>;
}

export async function detectChangedFiles({
    rootDir,
    entries,
    targetRecord,
    bundler,
    fsCache,
}: {
    rootDir: string;
    entries: FileUid[];
    targetRecord: TargetRecord;
    bundler: IBundler;
    fsCache: FsCache;
}) {
    const startupFilesToAudit = entries.concat(Object.keys(targetRecord.files));

    const filesToAudit: Set<FileUid> = new Set();
    await Promise.all(startupFilesToAudit.map(async (startupFile: FileUid) => {
        const delFromRecord = () => delete targetRecord.files[startupFile];

        if (!isVirtualFileUid(startupFile)) {
            if (!(await fsCache.pathExists(startupFile))) {
                delFromRecord();
                return;
            }

            const fileStat = await fsCache.stat(startupFile);
            const fileTime = fileStat.mtimeMs;
            if (!(startupFile in targetRecord.files) ||
                targetRecord.files[startupFile].fileTime !== fileTime ||
                Object.values(targetRecord.files[startupFile].dependencies).some((resolveRecord) => !resolveRecord.resolved)) {
                filesToAudit.add(startupFile);
                delFromRecord();
                return;
            }
        }

        if (!(await bundler.isOutFileValid(startupFile))) {
            filesToAudit.add(startupFile);
            delFromRecord();
            return;
        }
    }));
    return Array.from(filesToAudit);
}
