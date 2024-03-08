import type { FileUid } from './file-uid';

export interface FileRecord {
    failed?: boolean;
    fileTime: number;
    dependencies: Record<string, {
        resolved: FileUid | undefined;
        external?: boolean;
    }>;
    status: boolean;
}
