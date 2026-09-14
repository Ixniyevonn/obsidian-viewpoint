import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import builtins from "builtin-modules";
import { defineConfig, type Plugin } from "vite";
import manifest from "./manifest.json";

const pluginDirectory = `test-vault/.obsidian/plugins/${manifest.id}`;
const distributionFiles = [
	"main.js",
	"styles.css",
	"manifest.json",
	"versions.json",
];

function copyProductionBuild(): Plugin {
	return {
		name: "copy-production-build-to-test-vault",
		closeBundle() {
			mkdirSync(pluginDirectory, { recursive: true });
			for (const file of distributionFiles) {
				copyFileSync(
					path.join("build", file),
					path.join(pluginDirectory, file),
				);
			}
			console.log(`Copied production build to ${pluginDirectory}`);
		},
	};
}

export default defineConfig(({ mode }) => {
	const development = mode === "development";
	return {
		plugins: [
			svelte({ preprocess: vitePreprocess() }),
			...(!development ? [copyProductionBuild()] : []),
		],
		build: {
			lib: { entry: "src/main.ts", formats: ["cjs"] },
			outDir: development ? pluginDirectory : "build",
			// The vault can contain settings and hot-reload markers. Never clear it.
			emptyOutDir: !development,
			sourcemap: development ? "inline" : false,
			target: "es2022",
			rollupOptions: {
				output: {
					entryFileNames: "main.js",
					assetFileNames: "styles.css",
					codeSplitting: false,
				},
				external: [
					"obsidian",
					"electron",
					"@codemirror/autocomplete",
					"@codemirror/collab",
					"@codemirror/commands",
					"@codemirror/language",
					"@codemirror/lint",
					"@codemirror/search",
					"@codemirror/state",
					"@codemirror/view",
					"@lezer/common",
					"@lezer/highlight",
					"@lezer/lr",
					...builtins,
				],
			},
		},
	};
});
