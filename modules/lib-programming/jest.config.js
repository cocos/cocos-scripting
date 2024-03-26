module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testRegex: '/test/.*\\.(test|spec)?\\.(ts|tsx)$',
    globals: {
        'ts-jest': {
            tsconfig: 'tsconfig.spec.json',
            //   /* Fails on mapped import syntax without this.*/
            //   diagnostics: false,
        },
    },
};