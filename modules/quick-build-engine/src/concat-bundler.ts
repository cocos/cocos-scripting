import fs from 'fs-extra';
import ps from 'path';
import { CacheTransformed } from './cache-transformed';
import ConcatWithSourceMaps from 'concat-with-sourcemaps';
import { IBundler, TransformTargetModule } from './bundler';
import { IndexedSourceMap } from './indexed-source-map';
import { RawSourceMap } from 'source-map';
import { pathToFileURL } from 'url';
import RelateURl from 'relateurl';

class RegularConcat {
    constructor({
        file,
        separator,
    }: {
        file: string,
        separator?: string,
    }) {
        this._concat = new ConcatWithSourceMaps(true, file, separator);
    }

    get code() {
        return this._concat.content.toString('utf8');
    }

    get sourceMap() {
        return this._concat.sourceMap!.toString();
    }

    public add(code: string | Buffer, map?: RawSourceMap) {
        this._concat.add(null, code, map as any);
    }

    private _concat: ConcatWithSourceMaps;
}


type ConcatTool = RegularConcat | IndexedSourceMap;

export class ConcatBundler extends CacheTransformed implements IBundler {
    constructor(options: ConstructorParameters<typeof CacheTransformed>[0] & {
        format: 'commonjs' | 'systemjs',
    }) {
        super(options);
        this.targetMode = (options.format === 'commonjs') ?
            TransformTargetModule.commonJs : TransformTargetModule.systemJsNamed;
    }

    targetMode = TransformTargetModule.systemJsNamed;

    getModuleId(path: string) {
        return this._getModuleIdOfOutFile(this.getRelativeOutputPath(path));
    }

    getFinalUrl(path: string) {
        return this.getModuleId(path);
    }

    public async build({
        outDir,
        usedInElectron509,
        sourceRoot,
        inlineSourceMap,
        indexedSourceMap: useIndexedSourceMap,
    }: Parameters<IBundler['build']>[0]) {
        const outFile = ps.join(outDir, 'index.js');
        const concat: ConcatTool = new (useIndexedSourceMap ? IndexedSourceMap : RegularConcat)({
            file: outFile,
            separator: '\n',
        });

        const outURL = pathToFileURL(outFile);
        if (this.targetMode === TransformTargetModule.commonJs) {
            await this._concatToCommonJs(concat, outURL);
        } else {
            await this._concatToSystemJs(concat, outURL);
        }

        let sourceMapPromise: undefined | Promise<void>;
        if (inlineSourceMap) {
            concat.add(`//# sourceMappingURL=data:application/json;base64,${Buffer.from(concat.sourceMap).toString('base64')}`);
        } else {
            const sourceMapFile = `${ps.basename(outFile)}.map`;
            const sourceMapFileFullPath = ps.join(ps.dirname(outFile), sourceMapFile);
            const sourceMappingUrl = usedInElectron509 ?
                pathToFileURL(sourceMapFileFullPath).href :
                sourceMapFile;
            concat.add(`//# sourceMappingURL=${sourceMappingUrl}`);
            const sourceMapText = concat.sourceMap;
            // const hack509 = (sourceMap: any) => {
            //     // Electron 5.0.9 require path
            //     // sourceMap.file = outFile;
            //     // Do not include sources in source map
            //     delete sourceMap.sourcesContent;
            //     return sourceMap;
            // };
            // const sourceMapText = usedInElectron509
            //     ? JSON.stringify(hack509(JSON.parse(concat.sourceMap)), undefined, 2)
            //     : JSON.stringify(Object.assign({ sourceRoot: `${pathToFileURL(sourceRoot)}/` }, JSON.parse(concat.sourceMap)));
            sourceMapPromise = fs.outputFile(
                sourceMapFileFullPath,
                sourceMapText,
                { encoding: 'utf8' },
            );
        }
        await Promise.all([
            fs.outputFile(outFile, concat.code, { encoding: 'utf8' }),
            sourceMapPromise,
        ]);
    }

    private async _concatToCommonJs(concat: ConcatTool, outURL: URL) {
        wrapBigIIFEPre();

        await this.forEachModule(async (path, code, map, mapURL) => {
            if (map && mapURL) {
                relocateSourceFilePaths(map, mapURL, outURL);
            }
            wrapIIFEPre(this._getModuleIdOfOutFile(path));
            concat.add(/*path, */code, map);
            wrapIIFEPost();
        });

        wrapBigIIFEPost();

        function wrapBigIIFEPre() {
            concat.add(`\
module.exports = (function(){ return {
`);
        }

        function wrapBigIIFEPost() {
            concat.add(`\
}; })();`);
        }

        function wrapIIFEPre(path: string) {
            concat.add(`['${path}']: (function(exports, require){`);
        }

        function wrapIIFEPost() {
            concat.add(`}),`);
        }
    }

    private async _concatToSystemJs(concat: ConcatTool, outURL: URL) {
        await this.forEachModule(async (path, code, map, mapURL) => {
            if (map && mapURL) {
                relocateSourceFilePaths(map, mapURL, outURL);
            }
            concat.add(/*path, */code, map);
        });
    }

    protected _getModuleIdOfOutFile(relativeOutPath: string) {
        const parts = relativeOutPath.split(/[\\/]/g);
        return `q-bundled:///${parts.map((part) => encodeURIComponent(part)).join('/')}`;
    }
}

function relocateSourceFilePaths(
    sourceMap: RawSourceMap,
    sourceMapURL: URL,
    newSourceMapURL: URL,
) {
    if (!sourceMap.sources) {
        return;
    }
    const sources = sourceMap.sources;

    const resolveRelative = new RelateURl(newSourceMapURL.href);
    sources.map((source, iSource) => {
        const sourceURL = new URL(source, sourceMapURL);
        const resolved = resolveRelative.relate(sourceURL.href);
        sources[iSource] = resolved;
    });

    return sourceMap;
}
