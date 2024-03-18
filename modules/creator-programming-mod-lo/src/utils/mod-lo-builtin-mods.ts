import ps from 'path';
import { pathToFileURL, URL } from 'url';

const modLoBuiltinModBaseUrl: Readonly<URL> = new URL('cce:/internal/ml/');

const modLoBuiltinModFsRoot: Readonly<URL> = pathToFileURL(ps.join(__dirname, '..', '..', 'static', '/'));

/**
 * `cce:/internal/ml/cjs-loader.mjs` 模块的 URL。
 */
export const modLoBuiltinModCommonJsURL = new URL('cjs-loader.mjs', modLoBuiltinModBaseUrl).href;

/**
 * ModLo 内置模块需要的加载映射。
 */
export const modLoBuiltinLoadMappings: Readonly<Record<string, string>> = {
    [modLoBuiltinModBaseUrl.href]:  modLoBuiltinModFsRoot.href,
} as const;
