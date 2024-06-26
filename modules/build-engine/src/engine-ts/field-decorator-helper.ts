import * as fs from 'fs-extra';
import * as ps from 'path';
import { babel as Transformer } from '@ccbuild/transformer';

import BabelFile = Transformer.core.BabelFile;
import t = Transformer.core.types;
import addNamed = Transformer.helpers.addNamed;

export class FieldDecoratorHelper {
    private _moduleName = 'CCBUILD_HELPER_MODULE';
    private _moduleSource?: string;
    private _file2NamedIdentifier: WeakMap<BabelFile, t.Identifier> = new WeakMap();

    getModuleName (): string {
        return this._moduleName;
    }

    genModuleSource (): string {
        if (this._moduleSource) {
            return this._moduleSource;
        }
        return this._moduleSource = fs.readFileSync(ps.join(__dirname, '../../../../static/helper-file-decorator.ts'), 'utf8');
    }

    addHelper (file: BabelFile): t.Identifier | undefined {
        let namedIdentifier = this._file2NamedIdentifier.get(file);
        if (namedIdentifier) {
            return namedIdentifier;
        }

        // @ts-ignore
        namedIdentifier = addNamed(file.path, 'CCBuildTsFieldDecoratorHelper', this._moduleName);
        // @ts-ignore
        this._file2NamedIdentifier.set(file, namedIdentifier);
        return namedIdentifier;
    }
}