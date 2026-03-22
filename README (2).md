# Overview

A dimensional graph editor for interconnected worldbuilding. Notes exist within multiple simultaneous organizational structures (dimensions/axes). Switching dimensions reorganizes the spatial layout while preserving identity, creating a "rotation through concept-space" effect.
Built as a desktop application using Neutralino.js with Svelte frontend and custom simple canvas rendering.

## Core Concepts

### Dimension (Axis)

A dimensions is an organizational lens through which notes can be viewed. Each dimension has its own set of groups and connections between notes.
The same note may belong to different groups in different dimensions. Connections are dimension specific.

### Note

Note is an atomic unit of content. Each note has short description (which is inline-editable), long description (markdown edited in side pane), per-dimension group membership and per-dimension connections to other notes. Notes can exist outside of a group.

### Groups

Group is a named container within a dimension. A note's group membership is dimension-specific.

### Connection

Connections is a directed edges between notes within a dimension. Connections are always directional, have optional label, multiple connections between same nodes are allowed, two opposite connections appears as a single bidirectional one. Connections affect opacity propagation (see Focus System).

### Spectrum

A dimension can optionally define up to two spectra-semantic scales that determine group positioning on canvas. Each spectrum has a name, two poles (e.g [individual, collective]) and ordered stops between the poles. Groups declare their position on each spectrum using stop-names. Layout maps stops to canvas coordinates where 0% is first and 100% is last.

If dimension defines no spectra, groups fall back to automatic horizontal arrangement, while nodes in groups are stacked vertically.

## UI Layout

Left pane is the left side menu. It can be expanded by pressing button but can be used as is via button icons.
Right pane is the markdown editor which is usually hidden, expands on node text-editing.
In the middle is the canvas with nodes and groups, focused group/node is in the middle of canvas initially, though it can be panned and zoomed. On top of the canvas is Axis Switcher: current axis is in the middle, up to 2 dimensions to the right and 2 to the left to scroll through. "+" button to the right of axis switcher is to create a new axis (floating menu appears in the screen center).

> this system allowed node groups to be spread only horizontally, is there a way to allow verticality for full 2d usage of canvas?

### Canvas

Groups are rendered as labeled columns of nodes. **Node positions are fully computed by the layout system** - users cannot freely reposition nodes. Dragging a node changes its **order within a group** or **moves it between groups**, after which layout recomputes positions.

On the canvas, groups are placed horizontally in a row (while their elements are stacked inside vertically), unless spectra are specified for a dimension. If dimension has X-spectrum: group's x-stops map to horizontal position, if it has Y-spectrum – to vertical position.
Groupless nodes are placed in available free space on canvas.

#### Focus System

**Single Focus** is the main mode. Focused group/node is placed at canvas center. Adjacent by connection groups appear to left and right. Further groups continue outward.
**Dual Focus** is an additional mode. (Shift + Middle-click second target) Two focused items placed at left and right edges. Shortest path between them through nodes is rendered through the middle. Path of nodes/groups is displayed with full opacity (with slight fading in/out in/from the center).

Example opacity: focused - 1.0, directly connected - 0.95, two hops away - 0.9, further - 0.85.

Multiple _same direction_ connections between the same nodes act as "stronger" links. A node connected twice to a level-1 node is treated as level-1 itself, and notes connected to it are treated as level-2 instead of level-3 accordingly.

## Interaction Specification

### Node Interactions

| Action                       | Trigger                   | Behavior                                        |
| ---------------------------- | ------------------------- | ----------------------------------------------- |
| Create node                  | Double-click empty space  | New node at cursor position                     |
| Edit short description       | Single-click on node text | Inline text editing                             |
| Edit long description        | Double-click node         | Opens markdown editor in right pane             |
| Select                       | Click                     | Selects node                                    |
| Multi-select                 | Shift + click             | Adds to selection                               |
| Focus                        | Middle-click              | Sets as focus, recenters layout                 |
| Dual focus                   | Shift + middle-click      | Sets as second focus, shows path                |
| Begin connection             | Right click node          | Shows connection line preview                   |
| Complete connection          | Left click second node    | Creates directed connection                     |
| Start deleting connection    | Right click connection    | Connection-curve becomes red                    |
| Complete deleting connection | Left click red connection | Deletes connection                              |
| Delete                       | Select + Delete/Backspace | Removes node and its connections                |
| Cut                          | Ctrl+X or context menu    | Cuts to clipboard                               |
| Copy                         | Ctrl+C or context menu    | Copies to clipboard                             |
| Reorder in group             | Drag within group         | Node moves to new position in group's node list |
| Move to group                | Drag into group bounds    | Node joins group at drop position               |
| Remove from group            | Drag out of group bounds  | Node becomes groupless                          |

### Group Interactions

| Action       | Trigger                          | Behavior                                         |
| ------------ | -------------------------------- | ------------------------------------------------ |
| Create group | Ctrl+G                           | Creates group (containing selected nodes if any) |
| Rename       | Double-click label               | Inline text editing on group label               |
| Assign node  | Drag node into group             | Node joins group in current dimension            |
| Delete       | Select + Delete/Backspace/Ctrl+X | Removes group, nodes become groupless            |
| Dissolve     | Context menu → Dissolve          | Same as delete (priority 3)                      |

### Connection Interactions

| Action | Trigger                                                  | Behavior                |
| ------ | -------------------------------------------------------- | ----------------------- |
| Create | Right click on first node then left click on second node | New directed connection |
| Label  | Click connection → type                                  | Adds/edits label        |
| Delete | Select connection + Delete                               | Removes connection      |

### Dimension/Axis Interactions

| Action             | Trigger                   | Behavior                                |
| ------------------ | ------------------------- | --------------------------------------- |
| Next dimension     | Tab                       | Rotates to next axis, layout recomputes |
| Previous dimension | Ctrl+Tab                  | Returns to previous axis                |
| Scroll dimensions  | Scroll wheel              | Cycles through axes                     |
| Select dimension   | Click on axis in switcher | Switches to that axis                   |
| Create dimension   | Click [+] button          | Opens dimension creation dialog         |

### Canvas Interactions

| Action | Trigger                           | Behavior                             |
| ------ | --------------------------------- | ------------------------------------ |
| Pan    | Drag on empty space / middle-drag | Moves viewport                       |
| Zoom   | Ctrl+ScrollWheel                  | Zooms in/out                         |
| Paste  | Ctrl+V                            | Pastes at cursor position            |
| Undo   | Ctrl+Z                            | Reverts last action (priority 2)     |
| Redo   | Ctrl+Shift+Z                      | Reapplies undone action (priority 2) |
| Search | Ctrl+F                            | Opens search overlay (priority 3)    |

### Pane Interactions

| Element                        | Behavior                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| Right pane (editor)            | Resizable via left border handle. Displays markdown editor for selected node's long description |
| Left side menu                 | Navigation, save/load, settings                                                                 |
| Group outline (floating right) | Lists all groups in current dimension, click to focus                                           |
| Minimap (floating)             | Canvas overview with viewport indicator (priority 3)                                            |

### Visual Feedback

- **Dragging nodes/groups:** Ghost preview at cursor
- **Dragging connections:** Line from source to cursor
- **Hover on node edge:** border highlight, ready to set in focus
- **Selected items:** Visual highlight (border/glow)
- **Axis transition:** Animated node repositioning (FLIP)

## Priority Tiers

| Priority | Features                                                                                |
| -------- | --------------------------------------------------------------------------------------- |
| 1 (MVP)  | Nodes, groups, connections, dimensions, focus, axis switching, save/load, basic editing |
| 2        | Undo/redo, connection labels                                                            |
| 3        | Search, dissolve group, minimap                                                         |
| 4        | Dual focus path view                                                                    |
| 5        | Lasso multi-select                                                                      |

---

## Tech Stack

| Layer        | Technology                                                           |
| ------------ | -------------------------------------------------------------------- |
| Runtime      | Bun                                                                  |
| UI framework | Svelte 5                                                             |
| Language     | TypeScript                                                           |
| Styling      | CSS                                                                  |
| Canvas       | Pannable zoomable custom container for free positioned html elements |
| File parsing | js-yaml                                                              |
| Markdown     | marked                                                               |

## File Format Specification

Single YAML file. All data deterministically serializable. Optimized for LLM readability.

### Schema

```yaml
meta:
  name: string # World/project name
  created: ISO-8601 date
  modified: ISO-8601 date

dimensions:
  <dimension-id>:
    name: string
    x-spectrum: # optional
      name: string
      poles: [string, string] # e.g. ["individual", "collective"]
      stops: [string, ...] # ordered from first pole to second
    y-spectrum: # optional
      name: string
      poles: [string, string]
      stops: [string, ...]
    groups:
      - id: string
        name: string
        x: string | null # stop name from x-spectrum
        y: string | null # stop name from y-spectrum

notes:
  <note-id>:
    title: string # title
    short: string # short-form visible in graph
    long: string # full markdown content
    membership:
      <dimension-id>: <group-id> | null

connections:
  <dimension-id>:
    - from: <note-id>
      to: <note-id>
      label: string | null

node_order: # controls vertical order within groups
  "<dimension-id>:<group-id>": [<note-id>, ...]
  "<dimension-id>:ungrouped": [<note-id>, ...]
```

### Format Rationale

- **Flat connection lists:** LLMs can scan all relationships in one pass without traversing nested structures
- **Explicit membership per dimension:** Clear which group a note belongs to in each context
- **IDs separate from display names:** Stable references even when renaming
- **Nullable labels:** Connections without semantic annotation still valid
- **Duplicate connections allowed:** Multiple edges between same nodes represented as multiple list entries
