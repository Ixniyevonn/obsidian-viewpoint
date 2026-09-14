export type RunCommand = (args: string[], stream?: boolean) => Promise<string>;

/**
 * Get the GitHub repository from an origin URL.
 * @param url - An HTTPS or SSH GitHub URL without credentials.
 * @returns The owner and repository name.
 * @throws If the URL does not name a GitHub repository.
 */
export function githubRepository(url: string): string {
	const match = url
		.trim()
		.match(
			/^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/,
		);
	if (!match)
		throw new Error("Set origin to an HTTPS or SSH GitHub repository URL.");
	return match[1];
}

/**
 * Run a command from the repository root.
 * @param args - The executable and its arguments. No shell parses them.
 * @param stream - Show output directly when true.
 * @returns The captured output, or an empty string for streamed output.
 * @throws If the command fails. Git errors remain visible.
 */
export async function runCommand(
	args: string[],
	stream = false,
): Promise<string> {
	const process = Bun.spawn(args, {
		stdout: stream ? "inherit" : "pipe",
		stderr: "inherit",
	});
	const output = stream ? "" : await new Response(process.stdout).text();
	if ((await process.exited) !== 0)
		throw new Error(`Command failed: ${args.join(" ")}`);
	return output.trim();
}

/**
 * Check and publish the committed manifest version through GitHub Actions.
 * @param version - The stable version from the local manifest.
 * @param run - The command runner. Tests supply a runner without side effects.
 * @param dryRun - Check without creating a tag or pushing. Fetch still updates local Git metadata.
 * @returns The workflow URL and version. GitHub Actions creates the release later.
 * @throws If the tree is dirty, checks fail, or Git would overwrite remote work.
 * A failed push can leave a local tag. A retry accepts it only at the same commit.
 */
export async function publishRelease(
	version: string,
	run: RunCommand = runCommand,
	dryRun = false,
) {
	if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
		throw new Error("Use a stable manifest version in x.y.z format.");
	}
	if (await run(["git", "status", "--porcelain"]))
		throw new Error("Commit or remove pending changes before the release.");
	if ((await run(["git", "branch", "--show-current"])) !== "main")
		throw new Error("Switch to main before the release.");
	const repository = githubRepository(
		await run(["git", "remote", "get-url", "origin"]),
	);
	const head = await run(["git", "rev-parse", "HEAD"]);
	const tag = `refs/tags/${version}`;
	if (await run(["git", "ls-remote", "--tags", "origin", tag])) {
		throw new Error(
			`Remote tag ${version} already exists. Check its workflow or prepare a new version.`,
		);
	}
	const localTag = await run(["git", "tag", "--list", version]);
	if (localTag && (await run(["git", "rev-list", "-n", "1", tag])) !== head) {
		throw new Error(
			`Local tag ${version} points to another commit. Prepare a new version.`,
		);
	}
	await run(["git", "fetch", "--no-tags", "origin", "main"]);
	await run(["git", "merge-base", "--is-ancestor", "FETCH_HEAD", head]);
	await run(["bun", "run", "git:check"], true);
	if (
		(await run(["git", "status", "--porcelain"])) ||
		(await run(["git", "rev-parse", "HEAD"])) !== head
	) {
		throw new Error(
			"The working tree or commit changed during the checks. Review the changes before another attempt.",
		);
	}
	if (!dryRun) {
		if (!localTag) await run(["git", "tag", version, head]);
		await run(
			[
				"git",
				"push",
				"--atomic",
				"origin",
				`${head}:refs/heads/main`,
				`${tag}:${tag}`,
			],
			true,
		);
	}
	return {
		version,
		workflowUrl: `https://github.com/${repository}/actions`,
		dryRun,
	};
}

if (import.meta.main) {
	try {
		const args = process.argv.slice(2).filter((arg) => arg !== "--");
		if (args.some((arg) => arg !== "--dry-run"))
			throw new Error("Usage: bun run release:publish [--dry-run]");
		const manifest = await Bun.file("manifest.json").json();
		const result = await publishRelease(
			manifest.version,
			runCommand,
			args.includes("--dry-run"),
		);
		console.log(
			result.dryRun
				? `Release ${result.version} passed the checks. No tag or push occurred.`
				: `Pushed release ${result.version}. GitHub Actions will publish the assets after its checks pass.`,
		);
		console.log(result.workflowUrl);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
