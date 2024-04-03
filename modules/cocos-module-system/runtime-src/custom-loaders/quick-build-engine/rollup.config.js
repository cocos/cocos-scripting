import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import ps from 'path';

export default {
    input: ps.join(__dirname, 'index.js'),
    output: [{
        file: ps.join(__dirname, '..', '..', 'static', 'loader.js'),
        // file: String.raw`X:\Dev\Repos\Cocos\engine\bin\.cache\dev\editor\loader.js`,
        format: 'cjs',
        exports: 'named',
    }],
    inlineDynamicImports: true,
    plugins: [
        resolve({
            preferBuiltins: true,
        }),
        commonjs({
        }),
    ],
};
