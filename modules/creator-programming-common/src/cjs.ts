import { replaceExtension } from '@ccbuild/utils';
import { URL } from 'url';

export function isCjsInteropUrl(url: URL): boolean {
    return url.searchParams.has('cjs');
}

export function getCjsInteropTarget(url: URL): URL {
    const target = new URL(url.href);
    target.searchParams.delete('cjs');
    const originalExtension = target.searchParams.get('original');
    if (originalExtension) {
        target.searchParams.delete('original');
        replaceExtension(target, originalExtension);
    }
    return target;
}
