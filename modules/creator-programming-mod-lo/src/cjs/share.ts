
export const cjsMetaUrlExportName = '__cjsMetaURL';

/**
 * 在推测 CommonJS 模块的所有命名化导出时过滤掉这些。
 */
export const reservedIds = [
    'default', // `default` 承载了 `module.exports`
    cjsMetaUrlExportName, // 这个我们用来 `require` 目标模块
];
