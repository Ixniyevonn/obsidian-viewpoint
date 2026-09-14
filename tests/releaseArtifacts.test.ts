import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { verifyArtifacts } from "../scripts/verify-artifacts";

const temporaryDirectories: string[] = [];
afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		// Only remove directories returned by mkdtemp for this test.
		rmSync(directory, { recursive: true, force: true });
	}
});

function fixture() {
	const root = mkdtempSync(path.join(tmpdir(), "viewpoint-release-test-"));
	temporaryDirectories.push(root);
	const build = path.join(root, "build");
	mkdirSync(build);
	for (const file of ["manifest.json", "versions.json"]) {
		writeFileSync(path.join(root, file), '{"version":"1.0.0"}');
		writeFileSync(path.join(build, file), '{"version":"1.0.0"}');
	}
	writeFileSync(
		path.join(build, "main.js"),
		"module.exports = class Plugin {};",
	);
	writeFileSync(path.join(build, "styles.css"), ".node { color: red; }");
	return { root, build };
}

test("accepts a complete synchronized CommonJS release", () => {
	const { root, build } = fixture();
	expect(verifyArtifacts(build, root)).toEqual([]);
});

test("rejects missing CSS and metadata drift", () => {
	const { root, build } = fixture();
	rmSync(path.join(build, "styles.css"));
	writeFileSync(path.join(build, "manifest.json"), '{"version":"2.0.0"}');
	expect(verifyArtifacts(build, root)).toHaveLength(2);
});

test("rejects source maps, extra chunks, and ESM output", () => {
	const { root, build } = fixture();
	writeFileSync(
		path.join(build, "main.js"),
		"module.exports = {};\n//# sourceMappingURL=data:abc",
	);
	writeFileSync(path.join(build, "extra.js"), "export default 1;");
	expect(verifyArtifacts(build, root)).toHaveLength(2);
	writeFileSync(path.join(build, "main.js"), "export default class Plugin {}");
	expect(
		verifyArtifacts(build, root).some((error) => error.startsWith("main.js")),
	).toBe(true);
});
