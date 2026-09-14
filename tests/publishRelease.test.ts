import { expect, test } from "bun:test";
import {
	githubRepository,
	publishRelease,
	type RunCommand,
} from "../scripts/publish-release";

/**
 * Create a command recorder without Git or network side effects.
 * @param overrides - Outputs or failures keyed by command text.
 * @returns The runner and its recorded commands.
 */
function fixture(overrides: Record<string, string | Error | undefined> = {}) {
	const calls: string[] = [];
	const defaults: Record<string, string> = {
		"git branch --show-current": "main",
		"git remote get-url origin":
			"https://github.com/Ixniyevonn/obsidian-viewpoint.git",
		"git rev-parse HEAD": "abc123",
	};
	const run: RunCommand = async (args) => {
		const command = args.join(" ");
		calls.push(command);
		const result = overrides[command] ?? defaults[command] ?? "";
		if (result instanceof Error) throw result;
		return result;
	};
	return { run, calls };
}

test("publish checks first, then pushes the exact commit and tag atomically", async () => {
	const { run, calls } = fixture();
	await publishRelease("1.0.0", run);
	expect(calls.slice(-2)).toEqual([
		"git tag 1.0.0 abc123",
		"git push --atomic origin abc123:refs/heads/main refs/tags/1.0.0:refs/tags/1.0.0",
	]);
	expect(calls.indexOf("bun run git:check")).toBeLessThan(
		calls.indexOf("git tag 1.0.0 abc123"),
	);
});

test("dry run validates without a tag or push", async () => {
	const { run, calls } = fixture();
	await publishRelease("1.0.0", run, true);
	expect(calls).toContain("bun run git:check");
	expect(
		calls.some(
			(call) => call.startsWith("git push") || call.startsWith("git tag 1"),
		),
	).toBe(false);
});

test("dirty tree, wrong branch, existing remote tag, or failed checks stop publication", async () => {
	for (const overrides of [
		{ "git status --porcelain": " M README.md" },
		{ "git branch --show-current": "feature" },
		{ "git ls-remote --tags origin refs/tags/1.0.0": "abc123 refs/tags/1.0.0" },
		{ "bun run git:check": new Error("Checks failed") },
		{
			"git merge-base --is-ancestor FETCH_HEAD abc123": new Error(
				"Remote diverged",
			),
		},
	]) {
		const { run, calls } = fixture(overrides);
		await expect(publishRelease("1.0.0", run)).rejects.toThrow();
		expect(
			calls.some(
				(call) => call.startsWith("git push") || call.startsWith("git tag 1"),
			),
		).toBe(false);
	}
});

test("retry accepts only a local tag at the current commit", async () => {
	const good = fixture({
		"git tag --list 1.0.0": "1.0.0",
		"git rev-list -n 1 refs/tags/1.0.0": "abc123",
	});
	await publishRelease("1.0.0", good.run);
	expect(good.calls).not.toContain("git tag 1.0.0 abc123");
	const bad = fixture({
		"git tag --list 1.0.0": "1.0.0",
		"git rev-list -n 1 refs/tags/1.0.0": "older",
	});
	await expect(publishRelease("1.0.0", bad.run)).rejects.toThrow(
		"another commit",
	);
});

test("repository parsing supports GitHub HTTPS and SSH only", () => {
	expect(githubRepository("git@github.com:owner/repo.git")).toBe("owner/repo");
	expect(githubRepository("https://github.com/owner/repo.git")).toBe(
		"owner/repo",
	);
	expect(() => githubRepository("https://other.example/owner/repo")).toThrow();
});
