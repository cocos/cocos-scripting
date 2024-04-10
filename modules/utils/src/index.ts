import * as ps from './path';

export { ps };

// TODO: for module compatibility, to be removed.
export {
    formatPath,
    absolutePathFuncFactory,
    rebasePath,
    filePathToModuleRequest,
    toExtensionLess,
    readdirR,
} from './path';


export function isThenable (value: any): boolean {
    // https://stackoverflow.com/a/53955664/10602525
    return Boolean(value && typeof value.then === 'function');
}

export * from './types';
export { i18nTranslate } from './i18n';
export * from './asserts';
export * from './url';
export * from './specifier';
export * from './import-map';

/**
 * 以编辑器环境为编译目标对应的 browserslist 查询。
 */
export const editorBrowserslistQuery = `Electron 5.0.8`;