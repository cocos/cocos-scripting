
import NodeURL from 'url';
import URI from 'urijs';

export function pathToFileURL(path: string): string {
    return NodeURL.pathToFileURL(path).toString();
}

export function fileURLToPath(url: string): string {
    return NodeURL.fileURLToPath(url);
}

export function urlRelative(from: string, to: string): string {
    return new URI(to).relativeTo(from).valueOf();
}

export function urlResolve(from: string, to: string): string {
    return new URI(to).absoluteTo(from).valueOf();
}

export function moduleSpecifierURLRelative(from: string, to: string) {
    // https://medialize.github.io/URI.js/docs.html#relativeto
    const toURI = new URI(to);
    const relativeURI = toURI.relativeTo(from);
    const relativePath = relativeURI.path();
    if (relativeURI.valueOf() === relativePath && // Only path
        !relativePath.startsWith('..') &&
        !relativePath.startsWith('/')) {
        relativeURI.path(`./${relativePath}`);
    }
    return relativeURI.valueOf();
}