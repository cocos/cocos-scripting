
export default {
    modLo: {
        externals: ['foo:/bar', 'baz', 'baz2'],
        importMap: {
            'imports': {
                'cc': 'cce://internal//cc.js',
            }
        },
    },
};
