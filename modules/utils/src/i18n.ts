import util from 'util';

interface Params {
    'resolve_error_invalid_module_specifier': { specifier: string; reason?: string; };
    'resolve_error_invalid_package_configuration': { packageURL: string; };
    'resolve_error_invalid_package_target': { packageURL: string; };
    'resolve_error_package_path_not_exported': { subpath: string; packageURL: string; };
    'resolve_error_package_imports_not_defined': { specifier: string; packageURL: string; };
    'resolve_error_module_not_found': { specifier: string; parentURL: string; };
    'resolve_unsupported_directory_import': never;
    'import_map_parse_error': never;
    'import_map_null_entry_error': never;
    'import_map_import_match_error': never;
    'import_map_back_tracking_error': { prefix: string; };
    'modLo_can_not_be_base_url_error': { url: string };
    'modLo_cjs_interop_error': { url: string };
    'modLo_cjs_module_not_file_error': { url: string; };
    'modLo_access_denied_error': { url: string; };
    'modLo_access_denied_error_default_reason': never,
    'modLo_access_denied_error_unsupported_node_builtins': never,
    'modLo_access_denied_error_db_not_mounted': { domain: string };
    'modLo_fetch_file_error': { path: string; cause: any; };
    'quick_pack_could_not_resolve_entry': { specifier: string; };
    'quick_pack_failed_to_load': { url: string; cause: any; };
    'quick_pack_failed_to_resolve': { specifier: string; parentURL: string; cause?: any; };
    'load_error_hint_node_builtin': never;
    'resolve_error_hint_extension': never;
    'quick_pack_loader_resource_not_found_error': { id: string };
    'executor_failed_to_resolve': { specifier: string; parentURL: string; };
    'executor_system_js_origin': never,
    'executor_system_js_no_module_registered': { url: string; };
    'executor_failed_to_instantiate': { url: string; firstParentURL: string; };
    'executor_pack_mod_instantiation_error_host_resolve_error': { url: string, reason: unknown };
    'executor_pack_mod_instantiation_error_host_execute_error': { url: string, reason: unknown };
}


let i18n: undefined | null | I18N;

export function i18nTranslate<T extends keyof Params>(textName: T, params?: Params[T]) {
    const prefix = 'lib-programming';

    if (i18n === undefined) {
        try {
            i18n = Editor.I18n;
            i18n.register('zh', prefix, languages.zh);
            i18n.register('en', prefix, languages.en);
        } catch {
            i18n = null;
        }
    }

    const result = i18n?.t(`${prefix}.${textName}`, params);
    if (!result) {
        return `(i18n needed)${textName}: ${JSON.stringify(params, (_key, value) => {
            return value instanceof Error
                ? util.format(value)
                : value;
        })}`;
    } else {
        return result;
    }
}

const languages: Record<'zh' | 'en', Record<keyof Params, string>> = {
    en: {
        'resolve_error_invalid_module_specifier': 'Invalid module specifier {specifier} {reason}',
        'resolve_error_invalid_package_configuration': 'Invalid package configuration at {packageURL}',
        'resolve_error_invalid_package_target': 'Invalid package target at {packageURL}',
        'resolve_error_package_path_not_exported': 'Subpath "{subpath}" is not exported in package {packageURL}',
        'resolve_error_package_imports_not_defined': 'Package imports of package {packageURL} do not define the specifier {specifier}.',
        'resolve_error_module_not_found': 'Module "{specifier}" not found for {parentURL}',
        'resolve_unsupported_directory_import': 'Directory import is not supported',
        'import_map_parse_error': 'Import map parse error',
        'import_map_null_entry_error': 'Import map null entry touched',
        'import_map_import_match_error': 'Import map match error',
        'import_map_back_tracking_error': 'Import map can not backtrack above its prefix {prefix}',
        'modLo_can_not_be_base_url_error': 'The resolved URL {url} must not be in "cannot-be-a-base-URL" state',
        'modLo_cjs_interop_error': 'Cannot access CommonJS module {url} from the source module: {error}',
        'modLo_cjs_module_not_file_error': 'CommonJS module {url} is not file module',
        'modLo_access_denied_error': 'Can not load module {url}. Cause: ',
        'modLo_access_denied_error_default_reason': 'Unknown module.',
        'modLo_access_denied_error_unsupported_node_builtins': 'Node.js builtin modules are not provided by Cocos Creator.',
        'modLo_access_denied_error_db_not_mounted': 'The asset database {domain} is not mounted. Please check to see if related plugin is enabled.',
        'modLo_fetch_file_error': 'Error when fetching file {path}: {cause}',
        'quick_pack_could_not_resolve_entry': 'Could not resolve entry {specifier}',
        'quick_pack_failed_to_load': 'Failed to load module {url}: {cause}.',
        'quick_pack_failed_to_resolve': 'Failed to resolve {specifier} from {parentURL}, treat it as external dependency.\nWhich is caused by: {cause}',
        'load_error_hint_node_builtin':
            'Seems like you\'re attempted to import a Node.js builtin module. ' +
            'Note, Node.js builtin modules are not integrated within Creator.',
        'resolve_error_hint_extension':
            'Did you forget the extension? Please note that you can not omit extension in module specifier.',
        'quick_pack_loader_resource_not_found_error': 'Packed resource {id} not found.',
        'executor_failed_to_resolve': 'Failed to resolve {specifier} from {parentURL}.',
        'executor_system_js_origin': '<origin>',
        'executor_system_js_no_module_registered': 'Invalid module {url}: there ain\'t no module registered. This might be an internal error.',
        'executor_failed_to_instantiate': 'Failed to instantiate {url} from {firstParentURL}.',
        'executor_pack_mod_instantiation_error_host_resolve_error': 'The host could not resolve code chunk {url}\ncaused by\n{reason}',
        'executor_pack_mod_instantiation_error_host_execute_error': 'Error occurred when executing code chunk {url}\ncaused by\n{reason}',
    },
    zh: {
        'resolve_error_invalid_module_specifier': '无效的模块说明符：{specifier} {reason}',
        'resolve_error_invalid_package_configuration': '{packageURL} 的配置是无效的',
        'resolve_error_invalid_package_target': '{packageURL} 的 target 配置是无效的',
        'resolve_error_package_path_not_exported': '子路径 "{subpath}" 未在 {packageURL} 中导出',
        'resolve_error_package_imports_not_defined': '包 {packageURL} 许可的导入中不包含 {specifier}',
        'resolve_error_module_not_found': '以 {parentURL} 为起点找不到模块 "{specifier}"',
        'resolve_unsupported_directory_import': '不支持目录导入',
        'import_map_parse_error': 'Import map 解析错误',
        'import_map_null_entry_error': 'Import map 空项目',
        'import_map_import_match_error': 'Import map 匹配错误',
        'import_map_back_tracking_error': '不能回溯至它的前缀 {prefix}',
        'modLo_can_not_be_base_url_error': '解析出的 URL {url} 不能为 "cannot-be-a-base-URL" 状态',
        'modLo_cjs_interop_error': '不允许从源模块中访问 CommonJS 模块 {url}，因为 {error}',
        'modLo_cjs_module_not_file_error': 'CommonJS 模块 {url} 不是文件模块',
        'modLo_access_denied_error': '无法加载模块 {url}，这是因为：',
        'modLo_access_denied_error_default_reason': '未知来源的模块。',
        'modLo_access_denied_error_unsupported_node_builtins': 'Cocos Creator 不提供 Node.js 内置模块。',
        'modLo_access_denied_error_db_not_mounted': '资产数据库 {domain} 未挂载，请检查相关的插件是否正确启用。',
        'modLo_fetch_file_error': '在加载模块文件 {path} 时发生错误：{cause}',
        'quick_pack_could_not_resolve_entry': '无法解析入口 {specifier}。',
        'quick_pack_failed_to_load': '无法加载模块 {url} ：{cause}.',
        'quick_pack_failed_to_resolve': '无法从 {parentURL} 解析出模块 {specifier}，已将其视为外部模块。\n这是因为：{cause}',
        'load_error_hint_node_builtin':
            '你似乎意图导入 Node.js 内置模块，但请注意 Creator 并未集成 Node.js 内置模块。',
        'resolve_error_hint_extension':
            '你是否遗漏了扩展名？请注意你不能在模块说明符中省略扩展名。',
        'quick_pack_loader_resource_not_found_error': '未发现打包后的资源：{id}',
        'executor_failed_to_resolve': '无法从 {parentURL} 解析出模块 {specifier}。',
        'executor_system_js_origin': '<原点>',
        'executor_system_js_no_module_registered': '{url} 是无效的模块：脚本中未包含模块的注册。这可能是内部错误。',
        'executor_failed_to_instantiate': '无法实例化模块 {url} （起点是 {firstParentURL}）。',
        'executor_pack_mod_instantiation_error_host_resolve_error': '宿主无法解析代码块 {url}\n这是因为\n{reason}',
        'executor_pack_mod_instantiation_error_host_execute_error': '在执行代码块 {url} 时发生错误\n这是因为\n{reason}',
    },
};
