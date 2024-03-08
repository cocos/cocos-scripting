
export function deSlashBareModuleSpecifier(bareModuleSpecifier: string) {
    return bareModuleSpecifier.replace(/_/g, '__').replace('/', '_');
}

export function deSlashBareModuleSpecifierReverse(deSlashedBareModuleSpecifier: string) {
    return deSlashedBareModuleSpecifier.replace(/__/g, '_').replace('_', '/');
}