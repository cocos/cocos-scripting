/** @type {import('ts-jest').InitialOptionsTsJest} */
module.exports = {
    preset: 'ts-jest',
    testRegex: '/test/.*\\.(test|spec)?\\.(ts|tsx)$',
    globals: {
        'ts-jest': {
        },
    },
}