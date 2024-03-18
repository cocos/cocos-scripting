import resolve from '@rollup/plugin-node-resolve';

export default {
    input: "@endo/cjs-module-analyzer",
    output: {
        file: 'static/cjs-module-analyzer.js',
        format: 'cjs'
    },
    plugins: [
        resolve(),
    ],
};