import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
// import adapter from 'svelte-adapter-bun';
// import { sveltePreprocess } from 'svelte-preprocess';
// import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    // Consult https://svelte.dev/docs/kit/integrations
    // for more information about preprocessors
    preprocess: [
        // sveltePreprocess({}),
    ],
    onwarn: (warning, handler) => {
        if (warning.code === 'css_unused_selector') {
            return;
        }
        handler(warning);
    },

    kit: {
        // adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
        // If your environment is not supported, or you settled on a specific environment, switch out the adapter.
        // See https://svelte.dev/docs/kit/adapters for more information about adapters.
        // adapter: adapter({
        //     out: 'build',
        // }),
        // alias: {
        //     $assets: './src/lib/assets',
        //     $lib: './src/lib',
        // },
    },
};

export default config;
