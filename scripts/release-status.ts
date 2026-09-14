import { githubRepository, runCommand } from "./publish-release";

/**
 * Read the public GitHub release for the current manifest version.
 * @returns Nothing. Print the release URL and asset names.
 * @throws If GitHub rejects the request or required assets are missing.
 * A missing release produces a pending message and a nonzero exit code.
 */
async function main(): Promise<void> {
	const { version } = await Bun.file("manifest.json").json();
	const repository = githubRepository(
		await runCommand(["git", "remote", "get-url", "origin"]),
	);
	const response = await fetch(
		`https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(version)}`,
		{
			headers: { Accept: "application/vnd.github+json" },
		},
	);
	if (response.status === 404)
		throw new Error(
			`Release ${version} is not public yet. Check https://github.com/${repository}/actions`,
		);
	if (!response.ok)
		throw new Error(
			`GitHub returned HTTP ${response.status}. Check the release in the browser.`,
		);
	const release = (await response.json()) as {
		html_url: string;
		draft: boolean;
		assets: { name: string; size: number }[];
	};
	for (const name of ["main.js", "manifest.json", "styles.css"]) {
		if (!release.assets.some((asset) => asset.name === name && asset.size > 0))
			throw new Error(`Release asset ${name} is missing or empty.`);
	}
	if (release.draft) throw new Error("The release is still a draft.");
	console.log(`Release ${version} is public with all three required assets.`);
	console.log(release.html_url);
}

if (import.meta.main) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
