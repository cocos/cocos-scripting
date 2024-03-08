
import { SourceMapGenerator, RawIndexMap, RawSourceMap } from 'source-map';

export class IndexedSourceMap {
    constructor({
        file,
        separator,
    }: {
        file?: string,
        separator?: string,
    }) {
        this._sourceMap = {
            version: 3,
            file,
            sections: [],
        };
        this._separator = separator ?? '';
    }

    get code() {
        return this._code;
    }

    get sourceMap() {
        return JSON.stringify(this._sourceMap);
    }

    public add(code: string | Buffer, map?: RawSourceMap) {
        if (Buffer.isBuffer(code)) {
            code = code.toString();
        }
        if (this._separator) {
            this._addCode(this._separator);
        }
        if (map) {
            this._sourceMap.sections.push({
                offset: { line: this._lines, column: this._columns },
                map,
            });
        }
        this._addCode(code);
    }

    private _addCode(code: string) {
        const lines = code.split(/\r\n|\r|\n/g);
        this._lines += lines.length - 1;
        this._columns += lines[lines.length - 1].length;
        this._code += code;
    }

    private _sourceMap: RawIndexMap = {
        version: 3,
        sections: [],
    };

    private _code = '';
    private _lines = 0;
    private _columns = 0;
    private _separator = '';
}
