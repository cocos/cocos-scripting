import fs from 'fs-extra';
import ps from 'path';
import { IBundler } from './bundler';
import { CacheTransformed } from './cache-transformed';
// import esBuild, { Metadata } from 'esbuild';

// export class EsBuildBundler extends CacheTransformed implements IBundler {
//     public async build({
//         outDir,
//     }: Parameters<IBundler['build']>[0]) {
//         const entries: string[] = [];
//         const entryHome = ps.join(this.cacheDir, 'exports');
//         for (const entryFileName of (await fs.readdir(entryHome))) {
//             if (entryFileName.toLowerCase().endsWith('.js')) {
//                 const entryFile = ps.normalize(ps.join(entryHome, entryFileName));

//                 const systemProxyFile = ps.join(this.cacheDir, '__proxy', entryFileName);
//                 const relativeUrl = `./${ps.relative(ps.dirname(systemProxyFile), entryFile).replace(/\\/g, '/')}`;
//                 await fs.ensureDir(ps.dirname(systemProxyFile));
//                 await fs.writeFile(systemProxyFile, `
// import * as esExp from '${relativeUrl}';
// System.register([], function(_context, _export) {
//     return {
//         execute() {
//             _export(esExp);
//         },
//     }
// });
// `, 'utf8');
//                 entries.push(systemProxyFile);

//                 // entries.push(entryFile);
//             }
//         }

//         const bundleOutDir = ps.join(outDir, 'bundle');
//         await fs.ensureDir(ps.dirname(bundleOutDir));
//         console.time('esbuild');
//         const buildMetaFile = ps.join(outDir, 'bundle-meta.json');
//         const esBuildResult = await esBuild.build({
//             bundle: true,
//             entryPoints: entries,
//             outdir: ps.join(outDir, 'bundle'),
//             splitting: true,
//             format: 'esm',
//             sourcemap: 'inline',
//             metafile: buildMetaFile,
//             write: false,
//             external: ['@cocos/ammo', '@cocos/cannon'],
//             color: true,
//         });
//         console.timeEnd('esbuild');
//         for (const warning of esBuildResult.warnings) {
//             const location = !warning.location ? '' :
//                 `${warning.location.file}`;
//             console.warn(`${location}: ${warning.text}`);
//         }
//         console.time(`Transform trunks`);
//         await Promise.all(esBuildResult.outputFiles!.map(async (outputFile) => {
//             const { path, contents } = outputFile;
//             await fs.ensureDir(ps.dirname(path));
//             if (!path.toLocaleLowerCase().endsWith('.js')) {
//                 await fs.writeFile(path, contents);
//             } else {
//                 return await fs.writeFile(path, contents);

//                 // const source = Buffer.from(contents).toString('utf8');
//                 // let code: string;
//                 // let inputSourceMap: any;
//                 // // Note: . would not match the last new line
//                 // // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/dotAll
//                 // // See https://stackoverflow.com/questions/1979884/how-to-use-javascript-regex-over-multiple-lines
//                 // const sourceMapMatch = /\/\/# sourceMappingURL=data:application\/json;base64,(.*)/s.exec(source);
//                 // if (sourceMapMatch && typeof sourceMapMatch[1] === 'string') {
//                 //     inputSourceMap = JSON.parse(Buffer.from(sourceMapMatch[1], 'base64').toString());
//                 //     code = source.substr(0, source.length - sourceMapMatch[0].length);
//                 // } else {
//                 //     code = source;
//                 // }
//                 // const transformResult = await babel.transformAsync(code, {
//                 //     plugins: [babelPluginTransformModulesUmd],
//                 //     inputSourceMap,
//                 // });
//                 // if (!transformResult) {
//                 //     console.error(`Failed to transform bundle chunk to UMD!`);
//                 // } else {
//                 //     const codeWithMap = transformResult.map ?
//                 //         `${transformResult.code}\n//# sourceMappingURL=${ps.basename(path)}.map` :
//                 //         transformResult.code;
//                 //     await Promise.all([
//                 //         fs.writeFile(path, codeWithMap, 'utf8'),
//                 //         !transformResult.map ? undefined : fs.writeFile(`${path}.map`, JSON.stringify(transformResult.map), 'utf8'),
//                 //     ]);
//                 // }
//             }
//         }));
//         console.timeEnd(`Transform trunks`);
//         // const buildMeta = await fs.readJson(buildMetaFile) as Metadata;
//         // await Promise.all(Object.entries(buildMeta.outputs).map(async ([path, outputInfo]) => {

//         // }));
//     }
// }
