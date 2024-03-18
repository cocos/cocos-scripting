import { stringify as javascriptStringify } from 'javascript-stringify';

export function transformJson(
    _url: URL,
    source: string,
) {
    const json = JSON.parse(source);
    const exprSource = javascriptStringify(
        json,
        undefined,
        2,
    );
    return `export default ${exprSource}`;
}