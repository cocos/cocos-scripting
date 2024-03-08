import ps from 'path';

export type FileUid = string;

export function isVirtualFileUid(fileId: string) {
    return fileId.codePointAt(0) === 0;
}

export function encodeVirtualFileUid(moduleId: string) {
    return `\0${moduleId}`;
}

export function decodeVirtualFileUid(fileId: string) {
    return fileId.substr(1);
}

export function decodeRegularFilePath(fileUid: string) {
    return fileUid;
}

export function encodeRegularFilePath(path: string) {
    return path;
}

export function encodeFilePath(path: string, rootDir: string) {
    const relativeFromRoot = ps.relative(ps.join(rootDir), path);
    if (relativeFromRoot.length === 0 ||
        relativeFromRoot.startsWith('..') ||
        ps.isAbsolute(relativeFromRoot)) {
        return null;
    } else {
        return relativeFromRoot;
    }
}
