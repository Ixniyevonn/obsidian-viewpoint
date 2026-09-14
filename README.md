# Obsidian Viewpoint

Viewpoint is an Obsidian plugin for worldbuilding and other projects with connected notes. It shows the same notes through different dimensions.

A dimension defines groups and directed connections between notes. For example, a character can belong to a narrative group in one dimension and a political group in another.

Each project uses one `.viewpoint` file in your vault. The file contains YAML data. The plugin saves changes through Obsidian.

## Installation

Requires Obsidian 1.7.2 or newer. The plugin is listed as **Viewpoint**; its stable ID is `obsidian-viewpoint`.

### BRAT

Once the first GitHub release is published:

1. Install and enable [BRAT](https://github.com/TfTHacker/obsidian42-brat) from Community plugins.
2. Run **BRAT: Add a beta plugin for testing**.
3. Enter `Ixniyevonn/obsidian-viewpoint` and choose the latest version.
4. Enable **Viewpoint** in **Settings > Community plugins**.

BRAT installs the release assets and can keep the plugin updated. This does not require a listing in the Obsidian community plugin directory. See the [BRAT developer guide](https://github.com/TfTHacker/obsidian42-brat/blob/main/BRAT-DEVELOPER-GUIDE.md) for release behavior.

### Manual installation

Download `main.js`, `manifest.json`, and `styles.css` from the same [GitHub release](https://github.com/Ixniyevonn/obsidian-viewpoint/releases). Put all three files in `<vault>/.obsidian/plugins/obsidian-viewpoint/`, reload Obsidian, and enable **Viewpoint**. GitHub's automatic source-code archives do not contain the built plugin.

## Concepts and layout

| Term | Meaning |
| --- | --- |
| Note | Shared content with a title, a short description, and a long description. |
| Node | The card that shows a note on the canvas. |
| Dimension | A view with its own groups, note memberships, and connections. |
| Group | A named container for notes in one dimension. |
| Connection | A directed link between two notes in one dimension, with an optional label. |
| Spectrum | An ordered scale that places groups along a horizontal or vertical axis. |

The layout controls node positions. Nodes form a vertical list inside each group. Notes without a group appear in an Ungrouped container.

Without spectra, connections between groups determine their arrangement in rows and columns. Groups without connections use a horizontal row.

A dimension can define an X-spectrum, a Y-spectrum, or the two spectra together. Groups use named stops on each active spectrum. The layout adjusts spacing to fit the content.

The canvas combines HTML cards with SVG connections. Short descriptions support Markdown through the Obsidian renderer. Nodes automatically use 200, 320, or 440 pixels for up to 120, up to 300, or more visible title/description characters. Drag the right edge for a persistent manual width (120-600 pixels); nearby widths of notes in the same column snap within 8 screen pixels. Double-click the edge to restore automatic sizing.

## Obsidian links

Internal links such as `[[Demo Notes]]`, `[[Demo Notes#Fire magic|training]]`, and `[training](Demo%20Notes.md#Fire%20magic)` open through Obsidian using the viewpoint file as their source. Ctrl/Cmd-click or middle-click opens a new tab; hover previews follow the core Page preview settings for Viewpoint. Click description text outside a link to edit it.

## Start a project

1. Enable the plugin in Obsidian.
2. Run the **New viewpoint** command from the command palette.
3. Double-click the empty canvas to create a group.
4. Double-click inside the group to create a node.
5. Double-click the node title to change its name.
6. Click the short description to edit its text.

The folder context menu also contains **New viewpoint**. The **Viewpoint** ribbon button opens the graph view.

To try a populated project, copy [example.viewpoint](example.viewpoint) and [Demo Notes.md](Demo%20Notes.md) into the same folder in your vault. Then open the file in Obsidian.

## Controls

Keyboard shortcuts below use Ctrl. The editor also accepts Cmd for selection, group creation, and undo or redo.

| Action | Control |
| --- | --- |
| Create a group | Double-click the empty canvas, or use Ctrl+G. |
| Group selected nodes | Select the nodes, then use Ctrl+G. |
| Create a node | Double-click free space inside a group. |
| Select a node or group | Click the card background or group label. |
| Add or remove an item from the selection | Shift+click the item. |
| Rename a node or group | Double-click its title or label. |
| Edit a short description | Click the description. |
| Resize a node | Drag the right edge; nearby widths in the same column snap. |
| Restore automatic width | Double-click the right edge. |
| Move a node to a group | Drag the node into that group. |
| Remove a node from its group | Drag the node outside the named groups. |
| Delete selected nodes or groups | Use Delete or Backspace. Group deletion leaves its notes ungrouped. |
| Start a connection | Right-click the source node. |
| Finish a connection | Click the target node. |
| Edit a connection label | Double-click the curve or its label. |
| Change a connection endpoint | Drag the curve near that endpoint, then click the replacement node. |
| Delete a connection bundle | Right-click its curve, then click the red curve. |
| Add a dimension | Click **+** above the canvas. |
| Edit the active dimension | Click the pencil button above the canvas. |
| Switch dimensions | Click a dimension button, or scroll without Ctrl. |
| Select the next or previous dimension | Use Tab or Ctrl+Tab. |
| Place a group on spectra | Drag the group to the desired stops. |
| Pan the canvas | Drag the empty canvas, or drag with the middle mouse button. |
| Zoom | Use Ctrl+scroll. |
| Undo | Use Ctrl+Z. |
| Redo | Use Ctrl+Shift+Z or Ctrl+Y. |
| Cancel the current interaction | Use Esc. |

The dimension switcher shows buttons for the first ten dimensions. Scrolling and Tab also reach dimensions beyond those buttons.

Multiple connections between the same notes share a curve. Opposite connections show arrows in each direction. Deleting the curve removes all connections in that bundle.

## Current limits

These limits describe the current implementation:

- The file stores long descriptions, but the editor has no pane to view or edit them.
- Middle-click marks a node as focused. Shift+middle-click can mark a second node. Focus does not recenter the canvas or calculate paths or opacity.
- Node dragging changes group membership. It does not change the order inside a group.
- The layout reads `node_order` for named groups. It ignores entries for ungrouped notes.
- Copy and cut controls store note identifiers, but paste is absent. Cut removes the selected notes.
- The editor has no search overlay, minimap, group outline, or lasso selection.
- Connection label edits affect the first matching connection in one direction. Endpoint changes can replace multiple matching connections with one connection.

## Write project files

Use [SKILL.md](SKILL.md) to create or edit `.viewpoint` files. It defines the fields, reference rules, and checks for generated files.

The [example file](example.viewpoint) contains six notes across three dimensions. It includes spectra, ungrouped notes, labeled connections, all three automatic widths, and a custom width. Keep [Demo Notes.md](Demo%20Notes.md) beside it to try document links, heading links, aliases, and Markdown links. A ready-to-open copy is in `test-vault/Feature demo.viewpoint`.

Node positions, viewport settings, selections, and undo history are not part of the file format.

## Development

Use **Bun 1.3.14**, matching `packageManager` and CI. Install the locked dependencies:

```sh
bun install --frozen-lockfile
bun run git:check
```

| Command | Purpose |
| --- | --- |
| `bun run dev` | Watch sources and rebuild into the test vault with inline source maps. |
| `bun run build:dev` | Make one development build. |
| `bun run build` | Create a clean production build and copy it into the test vault. |
| `bun run test` / `bun run test:watch` | Run unit and release validation tests once or in watch mode. |
| `bun run check` | Check Svelte and TypeScript, including release scripts and tests. |
| `bun run lint` / `bun run lint:fix` | Run Biome without changes, or apply its safe fixes. |
| `bun run format` | Format source, release scripts, and tests. |
| `bun run verify:release` | Check root/public metadata, package version, and CI release tag. |
| `bun run verify:artifacts` | Verify the production bundle and metadata in `build/`. |
| `bun run git:check` | Run metadata checks, tests, type checks, lint, build, and artifact checks. |
| `bun run release:prepare -- 1.0.1` | Prepare the next version across all metadata files. |
| `bun run release:publish` | Check and push the committed version to start an automated release. |
| `bun run release:status` | Check the public release and its required assets. |

Production output is `build/main.js`, `build/styles.css`, `build/manifest.json`, and `build/versions.json`. Production bundles have no source maps. Both build modes write the plugin to `test-vault/.obsidian/plugins/obsidian-viewpoint/` and preserve local plugin settings.

Open `test-vault` as a vault in Obsidian, enable **Viewpoint**, and open `Feature demo.viewpoint`. Reload the plugin or Obsidian after rebuilding. Hot Reload is optional and must be installed separately; third-party plugins and vault settings are not tracked. If migrating an older checkout, remove the obsolete `obsidian-viewpoint-plugin` folder after preserving any local settings, so only one copy of the plugin is loaded.

The project uses Biome 2.4's full Svelte support. Existing lint/type-check warnings remain visible; errors fail validation. Changes to keyboard and pointer interactions also need a smoke test in Obsidian: open the demo, edit a description, resize/reset a card, switch dimensions, follow a document/heading link, and reload to confirm saving.

## Publishing

To publish the committed manifest version from a clean `main` branch:

```sh
bun run release:publish
```

The script runs all checks and pushes the commit and version tag together.
GitHub Actions then builds and publishes the release assets.
You do not need GitHub CLI on this computer.
Use `bun run release:publish --dry-run` to check without a tag or push.

After the workflow finishes, run `bun run release:status` to check the public release.
For the next version, run `bun run release:prepare -- 1.0.1` first.
Commit the metadata changes before publication.

See [Automated release scripts](GIT_WORKFLOW.md#automated-release-scripts) for each command, its requirements, and retry instructions.
Pushes to `main` and pull requests run checks but do not publish a release without a version tag.

## Source files

| Path | Purpose |
| --- | --- |
| `src/main.ts` | Plugin registration and project creation. |
| `src/views/GraphView.ts` | Obsidian file view and save requests. |
| `src/components/` | Canvas, cards, groups, connections, and dimension controls. |
| `src/stores/` | Project data, temporary interface state, and undo history. |
| `src/types.ts` | Project types. |
| `src/utils/helpers.ts` | YAML reader and writer. |
| `src/utils/layout.ts` | Node and group layout. |
| `src/utils/textMeasure.ts` | Text measurements for node sizes. |
| `manifest.json` / `versions.json` | Canonical release metadata. |
| `public/` | Synchronized metadata copied into builds by Vite. |
| `scripts/` | Release preparation and verification. |
| `.github/workflows/release.yml` | CI validation and tagged releases. |

The project uses TypeScript, Svelte 5, CSS, Vite, and `js-yaml`. The `@chenglou/pretext` library estimates text sizes for layout.

## License

[MIT](LICENSE), matching the Mermaid Inspector project.
