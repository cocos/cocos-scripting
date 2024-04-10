import { URL } from 'url';
import { i18nTranslate } from '@ccbuild/utils';

export abstract class ResolveError extends Error {
    constructor(
        public readonly baseUrl: string | undefined,
        ...args: ConstructorParameters<typeof Error>
    ) {
        super(...args);
    }
}

/**
 * Specifier 是无效的 URL、包名或包的子路径 specifier。
 */
export class InvalidModuleSpecifierError extends ResolveError {
    constructor(
        specifier: string,
        reason?: string,
        ...args: ConstructorParameters<typeof ResolveError>
    ) {
        super(...args);
        this.message = i18nTranslate('resolve_error_invalid_module_specifier', {
            specifier,
            reason,
        });
    }
}

export abstract class PackageResolveError extends ResolveError {
    constructor(
        public readonly packageUrl: string,
        ...args: ConstructorParameters<typeof ResolveError>
    ) {
        super(...args);
    }
}

/**
 *  `package.json` 配置无效或包含无效的配置。
 */
export class InvalidPackageConfigurationError extends PackageResolveError {
    constructor(...args: ConstructorParameters<typeof PackageResolveError>) {
        super(...args);
        const { packageUrl } = this;
        this.message = i18nTranslate('resolve_error_invalid_package_configuration', {
            packageURL: packageUrl,
        });
    }
}

/**
 * 包的导入或导出为包定义了目标模块，但该目标模块的类型无效或指定了一个字符串目标。
 */
export class InvalidPackageTargetError extends PackageResolveError {
    constructor(
        public readonly subpath: string,
        public readonly target: string,
        public readonly internal: boolean,
        ...args: ConstructorParameters<typeof PackageResolveError>
    ) {
        super(...args);
        const { packageUrl } = this;
        this.message = i18nTranslate('resolve_error_invalid_package_target', {
            packageURL: packageUrl,
        });
    }
}

/**
 * Package exports do not define or permit a target subpath in the package for the given module.
 */
export class PackagePathNotExportedError extends PackageResolveError {
    constructor(
        public readonly subpath: string,
        ...args: ConstructorParameters<typeof PackageResolveError>
    ) {
        super(...args);
        const { packageUrl } = this;
        this.message = i18nTranslate('resolve_error_package_path_not_exported', {
            subpath,
            packageURL: packageUrl,
        });
    }
}

/**
 * Package imports do not define the specifier.
 */
export class PackageImportNotDefined extends PackageResolveError {
    constructor(
        public readonly specifier: string,
        ...args: ConstructorParameters<typeof PackageResolveError>
    ) {
        super(...args);
        const { packageUrl } = this;
        this.message = i18nTranslate('resolve_error_package_imports_not_defined', {
            specifier,
            packageURL: packageUrl,
        });
    }
}

export class ModuleNotFoundError extends Error {
    constructor(specifier: string, parentURL: URL) {
        super(i18nTranslate('resolve_error_module_not_found', {
            specifier,
            parentURL: parentURL.href,
        }));
    }
}

export class UnsupportedDirectoryImportError extends Error {
    constructor() { super(i18nTranslate('resolve_unsupported_directory_import')); }
}

/**
 * ModLo 特定：解析出的 URL 含有 “cannot-be-a-base-URL” 状态。
 */
export class CanNotBeBaseURLError extends Error {
    constructor(url: URL) { super(i18nTranslate('modLo_can_not_be_base_url_error', { url: url.href })); }
}

/**
 * ModLo 特定：无法从源 ESM 模块中解析目标 CommonJS 模块。
 */
export class CjsInteropError extends Error {
    constructor(url: URL, error: Error) { super(i18nTranslate('modLo_cjs_interop_error', { url: url.href })); }
}

/**
 * ModLo 特定：CommonJS 模块必须是文件模块。
 */
export class CjsModuleNotFileError extends Error {
    constructor(url: URL) { super(i18nTranslate('modLo_cjs_module_not_file_error', { url: url.href })); }
}
