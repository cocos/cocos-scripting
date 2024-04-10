import { URL } from 'url';

export function parseExtensionName(pathname: string) {
    const segments = pathname.split('/');
    if (segments.length > 0) {
        const last = segments[segments.length - 1];
        if (last.length > 1) {
            const iLastDot = last.lastIndexOf('.');
            if (iLastDot >= 0) {
                return last.substr(iLastDot);
            }
        }
    }
    return '';
}

export function hasExtension(pathname: string) {
    return !!parseExtensionName(pathname);
}

export function replaceExtension(url: URL, ext: string) {
    const parts = url.pathname.split('/');
    if (parts.length !== 0) {
        const baseName = parts[parts.length - 1];
        const dot = baseName.lastIndexOf('.');
        if (dot >= 0) {
            const originalExtension = baseName.substr(dot + 1);
            parts[parts.length - 1] = `${baseName.substr(0, dot)}${ext}`;
            assignPathname(url, parts.join('/'));
            return '.' + originalExtension;
        }
    }
}

export function tryParseURL(input: string, base?: URL) {
    try {
        return new URL(input, base);
    } catch {
        return;
    }
}

export function assignPathname(url: URL, pathname: string) {
    if (!url.pathname.startsWith('/')) {
        console.warn(`Cannot change pathname of URL ${url} since it's a 'cannot-be-a-base-URL' URL.`);
    }
    // https://gist.github.com/shrinktofit/50f2380782b6219ed6a4cb3a210a75f7
    url.pathname = pathname;
    return url;
}

export function getBaseName(url: URL) {
    const segments = url.pathname.split('/');
    if (segments.length === 0) {
        return '';
    } else {
        const last = segments[segments.length - 1];
        const iDot = last.lastIndexOf('.');
        if (iDot >= 0) {
            return last.substr(0, iDot);
        } else {
            return last;
        }
    }
}

export function hasFileProtocol(url: URL) {
    return url.protocol === 'file:';
}
