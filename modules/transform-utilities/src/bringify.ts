
import browserify from 'browserify';
import browserifyIncremental from 'browserify-incremental';
import fs from 'fs-extra';
import ps from 'path';
const babelify = require('babelify');
// @ts-ignore
import babelPresetEnv from '@babel/preset-env';
import stream from 'stream';

export class Bringify {
    constructor(options: Bringify.Options) {
        this._projectDir = options.project;
        this._outDir = options.outDir;
        this._incrementalFile = options.incrementalFile;
    }

    /**
     * 
     * @param moduleMap Keys are alias module names. Values are mapped module ids.
     * @param options 
     */
    public async bring(moduleMap: Record<string, string>, options?: Bringify.BuildOptions) {
        options = options || {};

        const entryFile = new stream.Readable();
        entryFile.push(Object.keys(moduleMap).map((aliasedModuleId) => `module.exports['${aliasedModuleId}'] = require('${moduleMap[aliasedModuleId]}');`).join('\n'));
        entryFile.push(null);

        const browserifyOptions: browserify.Options = {
            bare: true,
            bundleExternal: true,
            basedir: this._projectDir,
            standalone: 'xYZ',
            debug: true,
        };
        const browserifyInstance = browserify(entryFile, Object.assign({}, browserifyIncremental.args, browserifyOptions));
        
        if (this._incrementalFile) {
            await fs.ensureDir(ps.dirname(this._incrementalFile));
        }

        const bundleFile = ps.join(this._outDir, 'bundle.js');
        await fs.ensureDir(ps.dirname(bundleFile));
        const bundleFileStream = fs.createWriteStream(bundleFile);

        await new Promise<string>((resolve, reject) => {
            // Incremental
            if (this._incrementalFile) {
                browserifyIncremental(browserifyInstance, { cacheFile: this._incrementalFile });
            }

            // Transform
            browserifyInstance.transform(babelify, {
                global: true,
                presets: [
                    [babelPresetEnv, { modules: "commonjs", }]
                ],
            });

            browserifyInstance.on('log', (message: string) => {
                console.log(`[[Browserify log]] ${message}`);
            });

            // Bundle
            const bundle = browserifyInstance.bundle();
            bundle.on('error', function (this: any, error) {
                this.emit('end');
                throw new Error(`[[Browserify bundle error]] ${error}`);
            })

            // Pipe bundle to file stream.
            bundle.pipe(bundleFileStream);

            bundleFileStream.on('finish', () => {
                resolve();
            });
            bundleFileStream.on('error', (error) => {
                reject(error);
            });
        });

        const mapping: Record<string, string> = {};
        let iChunk = 0;
        for (const aliasModuleId of Object.keys(moduleMap)) {
            const mappedFile = ps.join(this._outDir, 'chunks', `${iChunk++}.js`);
            mapping[aliasModuleId] = mappedFile;
            await fs.ensureDir(ps.dirname(mappedFile));
            await fs.writeFile(mappedFile, `
System.register(["../bundle.js"], function (_export, _context) {
  "use strict";
  var _m;
  return {
	setters: [function(m) {
        _m = m;
    }],
	execute: function () {
	  _export("default", _m.default["${aliasModuleId}"]);
	}
  };
});
`);
        }

        return {
            mapping,
        };
    }

    private _projectDir: string;
    private _outDir: string;
    private _incrementalFile?: string;
}

export namespace Bringify {
    export interface Options {
        project: string;

        outDir: string;

        incrementalFile?: string;
    }

    export interface BuildOptions {
        importMapFile?: string;
    }
}