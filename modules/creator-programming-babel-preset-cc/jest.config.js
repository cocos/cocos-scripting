/** @type {import('ts-jest').InitialOptionsTsJest} */
module.exports = {
    preset: 'ts-jest',
    testRegex: '/tests/.*\\.(test|spec)?\\.(ts|tsx)$',
    globals: {
        'ts-jest': {
        },
    },
}