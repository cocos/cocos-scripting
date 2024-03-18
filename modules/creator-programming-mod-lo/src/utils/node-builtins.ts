
export function isNodeJsBuiltinModule(moduleName: string): boolean {
    return [
        'assert',
        'buffer',
        'child_process',
        'cluster',
        'crypto',
        'dgram',
        'dns',
        'domain',
        'events',
        'fs',
        'http',
        'https',
        'net',
        'os',
        'path',
        'punycode',
        'querystring',
        'readline',
        'stream',
        'string_decoder',
        'timers',
        'tls',
        'tty',
        'url',
        'util',
        'v8',
        'vm',
        'zlib',
    ].includes(moduleName);
}

export function toNodeProtocolUrl(builtinModuleName: string) {
    return `node:${builtinModuleName}`;
}
