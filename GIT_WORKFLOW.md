# Git and release workflow

This project uses the Bun workflow from `obsidian-mermaid-inspector`.
The target repository is `Ixniyevonn/obsidian-viewpoint`, with `main` as the default branch.
The local preparation scripts do not create a GitHub remote or release.

## Commit rules

Before each commit, examine `git log -6 --oneline`.
Use a Conventional Commits prefix and an infinitive subject.
Do not add a scope unless the user asks for one.
Keep each commit limited to one logical change.
Separate independent features, fixes, tooling changes, and documentation changes.
Include the tests and documentation that the same change requires.
Each commit must build and leave the project usable.
Split mixed changes within a file by staging individual hunks.
An instruction to commit all changes means a sequence of atomic commits.
Do not combine unrelated changes into one commit.
Stage explicit paths for each atomic commit.
Replace the path placeholders below with the reviewed files.
Do not stage temporary artifacts.
Examine every path from `git diff --cached --name-only` before the commit.

## First publication

1. Install the exact dependencies with Bun 1.3.14:

   ```sh
   bun install --frozen-lockfile
   bun run git:check
   ```

2. Examine the changes before the commit:

   ```sh
   git status --short
   git diff
   git add -- <reviewed-path-1> <reviewed-path-2>
   git diff --cached --name-only
   git diff --cached
   git commit -m "build: prepare GitHub and BRAT releases"
   ```

   Review every staged file. Keep vault settings, installed plugins, build output,
   and personal notes out of the commit. The demo files are intentional fixtures.

3. Create an empty public GitHub repository named `obsidian-viewpoint` under
   `Ixniyevonn`, without generating a README, license, or gitignore. Then connect it:

   ```sh
   git remote add origin https://github.com/Ixniyevonn/obsidian-viewpoint.git
   git push -u origin main
   ```

   If the repository or remote already exists, inspect `git remote -v` and use it
   instead of creating another one. If you publish under another owner/name, also
   update the repository URL in `package.json` and the links in `README.md`.

4. Wait for the main-branch validation to pass. The first release uses version `1.0.0`. Check that this tag is unused locally and remotely before tagging:

   ```sh
   git tag --list 1.0.0
   git ls-remote --tags origin refs/tags/1.0.0
   git tag 1.0.0
   git push origin 1.0.0
   ```

   If that version already exists, prepare a new version with the steps below.

5. Confirm that Actions created the `1.0.0` release with three assets: `main.js`,
   `manifest.json`, and `styles.css`. Install `Ixniyevonn/obsidian-viewpoint` through
   BRAT in a separate vault and test the included demo and its document links.

The workflow uses GitHub's built-in token. You do not need a personal access token to publish. Repository/organization policy must permit Actions and the release
job's `contents: write` permission. The validation job only has read permission.

## Ordinary changes

```sh
git status --short
git diff
bun run git:check
git add -- <reviewed-path-1> <reviewed-path-2>
git diff --cached --name-only
git diff --cached
git commit -m "fix: describe the change"
git push origin main
```

A push to `main` or a pull request validates metadata, runs tests, checks Svelte and
TypeScript, lints, builds, verifies release assets, and uploads an Actions artifact.
It does not create a release or change the version.

## Publish the next BRAT update

Choose an unused stable version higher than the latest published one:

```sh
bun run release:prepare -- 1.0.1
git diff
bun run git:check
git add -- <reviewed-path-1> <reviewed-path-2>
git diff --cached --name-only
git diff --cached
git commit -m "chore: prepare release 1.0.1"
git push origin main
git tag 1.0.1
git push origin 1.0.1
```

To change the minimum supported Obsidian version, supply it explicitly:

```sh
bun run release:prepare -- 1.1.0 1.8.0
```

The preparation script updates `package.json`, root/public `manifest.json`, and
root/public `versions.json`. It preserves historical compatibility entries.
Root metadata is the source. Change descriptive fields in `manifest.json`.
Then run `release:prepare` with the target version to synchronize the public copy.

Tags use `x.y.z`, without a `v` prefix or prerelease suffix. This uses the stable
version convention used by the reference project. BRAT can distribute these releases
before Obsidian accepts the plugin into the official Community plugins directory.

## Build and failure handling

- `build/` is disposable. A production build clears it, creates the four distribution
  files, and copies them into the test vault without clearing plugin settings.
- `verify:artifacts` rejects missing/empty files, stale metadata, source maps,
  unexpected output files, and a bundle without CommonJS exports.
- The release job downloads the already validated Actions artifact. It does not
  rebuild from another commit. Tags and manifest versions must match.
- If validation fails, fix it before tagging. If you already published a release tag, use a new patch version instead of moving it or replacing its assets.
- A failed release upload can leave a partial release. Inspect its assets on GitHub
  before another attempt. The workflow does not overwrite existing releases.
- Preparation removed the tracked vault configuration from the index.
  `.gitignore` prevents future additions. Local files remain usable.
- Dependency upgrades are separate changes: update with Bun, commit `bun.lock`, and
  rerun `git:check`. Keep the Bun version in `package.json` and Actions synchronized.

See [BRAT's developer guide](https://github.com/TfTHacker/obsidian42-brat/blob/main/BRAT-DEVELOPER-GUIDE.md)
for how BRAT selects and installs release assets. See the
[official Obsidian release workflow](https://github.com/obsidianmd/obsidian-sample-plugin/blob/master/.github/workflows/release.yml)
for the expected asset names.
