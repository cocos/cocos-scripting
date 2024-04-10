import { URL } from 'url';
import { ImportMap, tryParseURL, isRelativeSpecifier } from '@ccbuild/utils';
import { parseImportMap, ImportMapParseError } from '../src/parse-import-map';
import { importMapResolve } from '../src/import-map-resolve';

describe('Import map parse errors', () => {
    test('Top level should be object', () => {
        expect(() => parseImportMap('[object Object]', new URL('foo:/bar'))).toThrow(ImportMapParseError);
    });
    test('"imports" should be object', () => {
        expect(() => parseImportMap({ imports: '[object Object]' }, new URL('foo:/bar'))).toThrow(ImportMapParseError);
    });
    test('"scopes" should be object', () => {
        expect(() => parseImportMap({ scopes: '[object Object]' }, new URL('foo:/bar'))).toThrow(ImportMapParseError);
    });
    test('Property of "scopes" should be object', () => {
        expect(() => parseImportMap({ scopes: { 's': '[object Object]' } }, new URL('foo:/bar'))).toThrow(ImportMapParseError);
    });
});

describe('Import map parse warns', () => {
    let spyWarn: jest.SpyInstance;
    beforeEach(() => {
        spyWarn = jest.spyOn(console, 'warn').mockImplementation();
    });
    afterEach(() => {
        spyWarn.mockRestore();
    });

    test('Warn extra keys', () => {
        parseImportMap({ extra: {} }, new URL('foo:/bar'));
        expect(spyWarn).toBeCalled();
    });
    test('Warn empty specifier map key', () => {
        parseImportMap({ imports: { '': './b' } }, new URL('foo:/bar'));
        expect(spyWarn).toBeCalled();
        spyWarn.mockClear();
        parseImportMap({ scopes: { 'c': { '': './b' } } }, new URL('foo:/bar'));
        expect(spyWarn).toBeCalled();
    });
    test('Warn non string address', () => {
        parseImportMap({ imports: { test: 1 } }, new URL('foo:/bar'));
        expect(spyWarn).toBeCalled();
    });
    test('Warn invalid address', () => {
        parseImportMap({ imports: { test: ':2' } }, new URL('foo:/bar'));
        expect(spyWarn).toBeCalled();
    });
    test('Warn mismatched end slash', () => {
        parseImportMap({ imports: { './test/': './add' } }, new URL('foo:/bar'));
        expect(spyWarn).toBeCalled();
    });
    // test('Warn non-parsable scope prefix', () => {
    //     parseImportMap({ scopes: { '&': {} } }, new URL('foo:/bar'));
    //     expect(spyWarn).toBeCalled();
    // });
});

describe(`Import map resolution`, () => {
    function parseAndResolve(
        specifier: string,
        baseURL: string,
        importMap: ImportMap,
        importMapURL: string,
    ) {
        const baseURLObject = new URL(baseURL);
        const parsedImportMap = parseImportMap(importMap, new URL(importMapURL));
        let asURL: URL | null;
        if (isRelativeSpecifier(specifier)) {
            asURL = new URL(specifier, baseURL);
        } else {
            asURL = tryParseURL(specifier) ?? null;
        }
        return importMapResolve(specifier, asURL, baseURLObject, parsedImportMap)?.href;
    }

    describe('Top level imports', () => {
        test('Bare mapping', () => {
            expect(parseAndResolve(
                'bare1',
                'foo:/bar',
                { imports: { 'bare1': 'foo:/bare-1' } },
                'foo:/import-map.json',
            )).toBe('foo:/bare-1');

            expect(parseAndResolve(
                'bare1',
                'foo:/bar',
                { imports: { 'bare1': './bare-1' } },
                'foo:/import-map.json',
            )).toBe('foo:/bare-1');
        });

        test('URL mapping', () => {
            for (const [src, target] of [
                ['foo:/scripts/baz', 'foo:/baz-mapped'],
                ['./scripts/baz', './baz-mapped'],
                ['./scripts/baz', 'foo:/baz-mapped'],
                ['foo:/scripts/baz', './baz-mapped'],
            ] as [string, string][]) {
                expect(parseAndResolve(
                    './baz',
                    'foo:/scripts/bar',
                    { imports: { [src]: target } },
                    'foo:/import-map.json',
                )).toBe('foo:/baz-mapped');
            }
        });

        test('Trilling slash mapping', () => {
            // We have to use file since trilling slash mapping require it's URL is special
            for (const [src, target] of [
                ['file:/scripts/', 'file:/another-scripts/'],
                ['./scripts/', './another-scripts/'],
                ['./scripts/', 'file:/another-scripts/'],
                ['file:/scripts/', './another-scripts/'],
            ] as [string, string][]) {
                expect(parseAndResolve(
                    './baz',
                    'file:/scripts/bar',
                    { imports: { [src]: target } },
                    'file:/import-map.json',
                )).toBe('file:///another-scripts/baz');
            }
        });
    });

    describe('Scoped import mappings', () => {
        test('Scoped', () => {
            expect(parseAndResolve(
                'bare1',
                'foo:/bar',
                {
                    scopes: {
                        'foo:/baz': {
                            'bare1': 'foo:/bare-2',
                        },
                    },
                },
                'foo:/import-map.json',
            )).toBe(undefined);
        });

        test('Fallback', () => {
            const importMap = {
                imports: {
                    'bare3': 'file:/bare-3',
                },
                scopes: {
                    'file:/libs/foo': {
                        'bare1': 'file:/bare-1',
                    },
                    'file:/libs/': {
                        'bare2': 'file:/bare-2',
                    },
                },
            };
            expect(parseAndResolve(
                'bare1',
                'file:/libs/foo',
                importMap,
                'file:/import-map.json',
            )).toBe('file:///bare-1');

            expect(parseAndResolve(
                'bare2',
                'file:/libs/foo',
                importMap,
                'file:/import-map.json',
            )).toBe('file:///bare-2');

            expect(parseAndResolve(
                'bare3',
                'file:/libs/foo',
                importMap,
                'file:/import-map.json',
            )).toBe('file:///bare-3');
        });
    });
});

