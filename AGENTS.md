# Local development

- Use Bun 1.3.14, as pinned in `package.json` and GitHub Actions.
- Use `bun run git:check` before you complete changes that affect code or releases.
- Run `bun run build` after plugin changes. It refreshes both `build/` and the local test-vault plugin.
- Keep `manifest.json` and `versions.json` canonical. Use `bun run release:prepare -- <version>` to synchronize package and public metadata.
- Do not change the plugin ID `obsidian-viewpoint` when changing its display name.
- Keep vault settings, installed third-party plugins, and build output untracked. Preserve local plugin settings during builds.
- Keep examples and README controls aligned with implemented behavior.
- See `GIT_WORKFLOW.md` for publication steps. Local release preparation does not publish, push, or tag anything.

## Browser

- Use `C:\Users\Ixniy\AppData\Local\Chromium\Application\chrome.exe` as the built-in browser for local UI tests.

## Implementation and styles

Prefer native web features when they meet the requirement.
Use current Svelte 5 features that the installed version supports.
Do not use legacy Svelte features unless they are necessary.
Use CSS features that the supported Obsidian versions can render.
Reuse Obsidian theme variables and existing component styles.
Use Bun for temporary scripts, file edits, data transforms, and diagnostics.
Do not use Node.js as the command runtime.

## Format files with Biome

Use Biome for Svelte, TypeScript, JavaScript, CSS, and JSON files.
Do not use Prettier for these files.
Format changed supported files with `bunx biome format --write <paths>`.
Before completion, run `bunx biome format <paths>` on the same files.
Use `bun run format` when the task requires formatting the complete source tree.
Do not format unrelated files or temporary artifacts.

## Name identifiers from general to specific

Put the greater category first. Put the lesser category last.
Write `groupNameContent` and `groupNameAvailability`.
Do not write `contentGroup` or `availabilityGroup`.
This rule applies to code identifiers.

## Write documentation and comments in STE

Before you write or change documentation or comments, read the `ste-writing` skill.
The skill is at `C:\Sync\Arc\Projects\-skills\ste-writing\SKILL.md`.
Obey that skill. This rule is mandatory. Do not skip it.

This rule applies to:

- Markdown files
- README files
- Agent instructions
- TSDoc and JSDoc
- Inline comments
- Error messages that users see
- Pull-request text
- Release notes
- Artifact documents in `artifacts/`

This rule does not apply to code, identifiers, or command syntax.

Use Simplified Technical English (STE)-flavored mode for documentation and comments.
Use strict mode for procedures, runbooks, safety text, and error messages.

After you write the text, lint it with `bun "C:/Sync/Arc/Projects/-skills/ste-writing/ste-lint.ts" <path>`.
Fix the reported categories. Then lint again. Do at most two passes.
Do not present the text as clean if you did not run the lint.

## Suggest implementation

Do not treat common web practice as a quality standard.
A widely used design is often not the best design. It is often not even a good design.
Do not copy a design because it is common or standard.

Prefer the most direct solution that does the work.
Keep the number of layers, wrappers, and abstractions as low as the problem permits.
Add an abstraction only for a repeated problem or a platform limit that blocks a direct path.
Prefer data and direct transforms over object graphs, service layers, and hidden control flow.

Clever means a short, obvious path that removes work. It does not mean extra machinery.
Do not add a type, interface, store, or helper only to match a known pattern.
Do not recommend extra layers that this problem does not need.

Before you implement a user request, examine other designs that can do the same work.
If the request and the direct design are clear, implement the direct design without a choice.
Do not ask the user to choose between implementation details that have the same outcome.

Show a choice only when different designs have important consequences that the request does not resolve.
These consequences can affect behavior, data, security, performance, or maintenance.

When a choice is necessary, give two to four concrete and mutually exclusive options.
Put the recommended option first and label it `Recommended`.
Recommend the most direct design that meets the constraints.
For each option, briefly explain its consequence or tradeoff.
Let the user give a custom answer if the options do not apply.
While you wait, continue only work that does not depend on the choice.

## Clarify ambiguity

Stop before you make a decision if any of these items are unclear:

- The user request
- The expected outcome
- The constraints
- The target files
- The implementation choices
- The path to the goal

Ask the user to choose.
This rule applies to ambiguities that occur before or during implementation.
Do not make a silent assumption or choose for the user.
Do not treat multiple equivalent implementation methods as ambiguity.

Give two to four concrete and mutually exclusive options.
Put the recommended option first and label it `Recommended`.
For each option, briefly explain its consequence or tradeoff.
Let the user give a custom answer if the options do not apply.
While you wait, continue only work that does not depend on the unclear decision.

## Handle access and environment blockers

Stop if an access or environment problem prevents the intended operation.
These problems include access restrictions, file locks, sandbox limits, and package-manager failures.
Explain the exact blocker and its effect.
Ask the user how to continue before you make more changes.

Do not create an improvised workaround.
Examples include alternate caches, copied dependency trees, temporary package roots, and other improvised file-system artifacts.

## Document standalone modules

When you create or substantially rewrite a standalone module, document every function with TSDoc or JSDoc.
This requirement applies to utility, data, service, and helper modules.
Each comment must give the function purpose, parameters, and return value.
Also document applicable errors, side effects, security assumptions, and input constraints.
This requirement applies to exported and internal functions.
Write those comments in STE. Obey the `ste-writing` skill.

## Protect rendering performance

Limit project reads, layout calculations, and Markdown rendering to the data that each view needs.
Do not repeat unrelated work when a user selects a note or switches a dimension.
Do not use `untrack` to hide a real data dependency.
Keep migrations and repairs outside normal pointer and render paths.
Release subscriptions, observers, event listeners, and rendered components when their owner closes.
Invalidate a cache when its source changes.
Prevent a slow operation from restoring stale data after a later edit.

## Store agent resources and temporary files

Store agent-specific resources in `artifacts/`.
Store implementation plans in `artifacts/plans/`.
Store temporary scripts, drafts, logs, screenshots, diagnostics, browser profiles, and caches in `artifacts/temp/`.
Run temporary scripts with Bun from the project root.
Keep permanent build and release scripts in `scripts/`.
Do not add `artifacts/temp/` to Git.

## Commit changes

Before you create a commit, examine the recent Git history and match its convention.
Use a Conventional Commits prefix.
Write the commit message in the infinitive form.
Do not add a Conventional Commits scope unless the user asks for one.

Keep each commit limited to one logical change.
Separate independent features, fixes, tooling changes, and documentation changes.
Include the tests and documentation that the same change requires.
Each commit must build and leave the project usable.
Split mixed changes within a file by staging individual hunks.
An instruction to commit all changes means a sequence of atomic commits.
Do not combine unrelated changes into one commit.
Stage explicit paths for each atomic commit.
Do not use `git add .`, `git add -A`, or a broad path when temporary files exist.

Before each commit, run `git diff --cached --name-only` and examine every staged path.
Unstage each temporary artifact before you create the commit.

## Use shared agent skills

Shared skills are in `C:\Sync\Arc\Projects\-skills\`.
Each skill has a subdirectory with a `SKILL.md` file.
This project uses these shared skills.

Do not copy skill files into this repository or these vendor skill folders:

- `.grok/skills`
- `~/.grok/skills`
- `.claude/skills`
- `.cursor/skills`

If a tool cannot scan the shared folder, add the folder path to the tool's skill-search configuration.
Alternatively, create a symbolic link to the shared directory.
Do not duplicate the files.

If a task matches a skill description, read that skill's `SKILL.md` from the shared folder.
Also read the file if the user names the skill.
Obey the skill instructions.

The `ste-writing` skill is mandatory for every documentation and comment task.
Read `C:\Sync\Arc\Projects\-skills\ste-writing\SKILL.md` before you write that text.
Write a new global skill only under `C:\Sync\Arc\Projects\-skills\<name>\`.

## Browser process safety

Do not substitute Microsoft Edge when the configured Chromium executable exists.
Use a separate profile and debugging port for each concurrent test.
Store profiles and screenshots in `artifacts/temp/`.
Use `-WindowStyle Hidden` when you start a background process through PowerShell.
Stop only the browser session that the task started.
Do not stop the user's other browser processes.
