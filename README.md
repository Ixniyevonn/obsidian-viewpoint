# Obsidian Viewpoint

Viewpoint is an Obsidian plugin for worldbuilding and other projects with connected notes. It shows the same notes through different dimensions.

A dimension defines groups and directed connections between notes. For example, a character can belong to a narrative group in one dimension and a political group in another.

Each project uses one `.viewpoint` file in your vault. The file contains YAML data. The plugin saves changes through Obsidian.

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

## Start a project

1. Enable the plugin in Obsidian.
2. Run the **New viewpoint** command from the command palette.
3. Double-click the empty canvas to create a group.
4. Double-click inside the group to create a node.
5. Double-click the node title to change its name.
6. Click the short description to edit its text.

The folder context menu also contains **New viewpoint**. The **Viewpoint** ribbon button opens the graph view.

To try a populated project, copy [example.viewpoint](example.viewpoint) into your vault. Then open the file in Obsidian.

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

The [example file](example.viewpoint) contains six notes across three dimensions. It includes spectra, ungrouped notes, labeled connections, Markdown, and a custom node width.

Node positions, viewport settings, selections, and undo history are not part of the file format.

## Build and install

Development requires Bun and Obsidian.

1. Install the dependencies:

   ```sh
   bun install
   ```

2. Build the plugin:

   ```sh
   bun run build
   ```

3. Create `.obsidian/plugins/obsidian-viewpoint/` inside your vault.
4. Copy `main.js`, `manifest.json`, and `styles.css` from `build/` into that folder.
5. Reload Obsidian.
6. Enable **Obsidian Viewpoint Plugin** in **Settings > Community plugins**.

For development, run `bun run dev`. Vite watches the source files and writes the plugin into `test-vault/.obsidian/plugins/obsidian-viewpoint-plugin/`. Reload the plugin in Obsidian after a rebuild.

Run `bun run check` for Svelte and TypeScript checks. Run `bun run format` to format the source files.

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
| `public/manifest.json` | Plugin metadata. |

The project uses TypeScript, Svelte 5, CSS, Vite, and `js-yaml`. The `@chenglou/pretext` library estimates text sizes for layout.
