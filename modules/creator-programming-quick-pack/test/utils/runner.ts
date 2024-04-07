
import { ModLo } from '@cocos/creator-programming-mod-lo';
import { QuickPack } from '../../src/quick-pack';
import { unitTestLogger } from '@cocos/creator-programming-test-utils';

export function createSimpleRunner (origin: string, workspace: string) {
    const modLo = new ModLo({
        _compressUUID: () => '',
        logger: unitTestLogger,
    });
    const quickPack = new QuickPack({
        modLo,
        origin,
        workspace,
        sourceMaps: false,
        logger: unitTestLogger,
    });
    return {
        modLo,
        quickPack,
    };
}