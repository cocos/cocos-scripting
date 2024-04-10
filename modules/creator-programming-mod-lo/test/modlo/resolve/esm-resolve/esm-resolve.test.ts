import { asserts, assertsIsFalse } from '@ccbuild/utils';
import { unitTestLogger } from '@cocos/creator-programming-test-utils/lib/test-logger';
import { ModLo } from '../../../../src/mod-lo';
import { InvalidModuleSpecifierError } from '../../../../src/resolver/resolve-error';

describe(`Esm resolve`, () => {
    test(`.`, async () => {
        const modLo = new ModLo({
            _compressUUID: () => '',
            logger: unitTestLogger,
        });

        await expect(modLo.resolve('.', new URL('foo:/bar'))).rejects.toThrowError(InvalidModuleSpecifierError);
    });
});