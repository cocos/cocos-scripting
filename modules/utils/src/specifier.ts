import { tryParseURL } from './url';

export function isRelativeSpecifier(specifier: string) {
    return specifier.startsWith('/') ||
        specifier.startsWith('./') ||
        specifier.startsWith('../');
}

export function isBareSpecifier(specifier: string) {
    return !isRelativeSpecifier(specifier) && !tryParseURL(specifier);
}
