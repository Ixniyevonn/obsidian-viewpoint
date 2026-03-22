module.exports = {
    overrides: [
        {
            files: ['**/*.svelte'],
            processor: 'svelte3/svelte3'
        }
    ],
    settings: {
        'svelte3/ignore-styles': () => true
    },
    plugins: ['svelte3'],
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
    },
    env: {
        browser: true,
        es2021: true,
    },
    extends: [
        'eslint:recommended'
    ],
};

