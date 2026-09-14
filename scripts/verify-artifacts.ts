import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Script } from "node:vm";

export const distributionFiles = [
	"main.js",
	"styles.css",
	"manifest.json",
	"versions.json",
] as const;

/** Check exactly what the release workflow uploads, without loading Obsidian. */
export function verifyArtifacts(
	directory: string,
	root = process.cwd(),
): string[] {
	const errors: string[] = [];
	for (const file of distributionFiles) {
		try {
			const content = readFileSync(path.join(directory, file), "utf8");
			if (!content.trim()) errors.push(`${file} is empty`);
			if (file.endsWith(".json")) {
				const expected = JSON.parse(
					readFileSync(path.join(root, file), "utf8"),
				);
				if (JSON.stringify(JSON.parse(content)) !== JSON.stringify(expected)) {
					errors.push(`${file} differs from repository metadata`);
				}
			}
			if (file === "main.js") {
				new Script(content, { filename: file });
				if (!/module\.exports\s*=|exports\./.test(content))
					errors.push("main.js is not a CommonJS plugin");
			}
			if (/sourceMappingURL=/.test(content))
				errors.push(`${file} contains a source map`);
		} catch (error) {
			errors.push(
				`${file}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	try {
		for (const file of readdirSync(directory)) {
			if (!(distributionFiles as readonly string[]).includes(file))
				errors.push(`Unexpected build artifact: ${file}`);
		}
	} catch {
		errors.push(`Build directory is missing: ${directory}`);
	}
	return errors;
}

if (import.meta.main) {
	const errors = verifyArtifacts("build");
	if (errors.length) {
		for (const error of errors)
			console.error(`Release artifact error: ${error}`);
		process.exit(1);
	}
	console.log(
		"Release artifacts are ready: main.js, manifest.json, styles.css, versions.json.",
	);
}
