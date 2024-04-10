import type { PackerDriverLogger } from './logger';
import type { SharedSettings } from '@ccbuild/utils';

export interface IPackerDriverCallbacks {
    queryEditorPatterns: () => Promise<string[]>;
    queryIncludeModules: () => Promise<string[]>;
    querySharedSettings: (logger: PackerDriverLogger) => Promise<SharedSettings>;
    compressUUID: (uuid: string, min: boolean) => string;
    beforeBuild: (changes: AssetChange[]) => Promise<void>;
    transformFilePathToDbPath: (filePath: string) => Promise<string | null | undefined>;
}

export interface AssetDatabaseDomain {
    /**
     * 此域的根 URL。
     */
    root: URL;

    /**
     * 此域的物理路径。
     */
    physical: string;

    /**
     * 此域的物理根路径。如果未指定则为文件系统根路径。
     * 在执行 npm 算法时会使用此字段。
     */
    jail?: string;
}

export type UUID = string;
export type FilePath = string;

export enum AssetChangeType { add, remove, modified }

export interface AssetChange {
    type: AssetChangeType;
    url: Readonly<URL>;
    uuid: UUID;
    isPluginScript: boolean;
    filePath: FilePath;
}

export interface EngineInfo {
    typescript: {
        type: 'builtin' | 'custom'; // 当前使用的引擎类型（内置或自定义）
        custom: string; // 自定义引擎地址
        builtin: string, // 内置引擎地址
        path: string; // 当前使用的引擎路径，为空也表示编译失败
    },
    native: {
        type: 'builtin' | 'custom'; // 当前使用的引擎类型（内置或自定义）
        custom: string; // 自定义引擎地址
        builtin: string; // 内置引擎地址
        path: string; // 当前使用的引擎路径，为空也表示编译失败
    },
}
