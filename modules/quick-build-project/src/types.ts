import type { SharedSettings } from '@ccbuild/utils';
import { Logger } from '@cocos/creator-programming-common';
import { AssetChange } from '@ccbuild/utils';
import type { PackerDriver } from './packer-driver';

export interface IPackerDriverCallbacks {
    onQueryEditorPatterns(): Promise<string[]>;
    onQueryIncludeModules(): Promise<string[]>;
    onQuerySharedSettings(logger: Logger): Promise<SharedSettings>;
    onCompressUUID(uuid: string, min: boolean): string;
    onBeforeBuild(changes: AssetChange[]): Promise<void>;
    onTransformFilePathToDbPath(filePath: string): Promise<string | null | undefined>;
    onInit(): Promise<void>;
    onDestroy(): Promise<void>;
}
