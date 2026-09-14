---
name: obsidian-viewpoint
description: Create and edit .viewpoint YAML files for Obsidian Viewpoint. Use to turn content into graph projects, change notes and dimensions, or inspect file structure and references.
---

# Write Viewpoint files

Create `.viewpoint` files that the Obsidian Viewpoint plugin can open and edit. Use this skill for new projects and changes to existing projects.

Read [example.viewpoint](example.viewpoint) when you need a populated example. It shows three dimensions, six notes, spectra, connections, group order, and a custom node width.

## Create a project

1. Identify the entities that need separate notes.
2. Choose dimensions that answer distinct questions about those entities.
3. Define the groups for each dimension.
4. Assign stable identifiers (IDs) to the dimensions, groups, and notes.
5. Write the shared content for each note.
6. Assign each note to a group or to `null` in each relevant dimension.
7. Add outgoing connections to the source notes.
8. Set the note order for named groups where order matters.
9. Do the file checks below.
10. Save the YAML text with the `.viewpoint` extension.

Use one note for one entity across dimensions. Store its title and descriptions once. Group membership and connections can differ between dimensions.

Use spectra when an ordered scale helps place groups. Omit spectra when automatic placement is sufficient.

## File structure

A project contains four top-level fields: `meta`, `dimensions`, `notes`, and `node_order`. Use mappings for these fields.

This example is a valid starting point:

```yaml
meta:
  name: Untitled
  created: "2026-09-13T00:00:00Z"
  modified: "2026-09-13T00:00:00Z"
dimensions:
  default:
    name: Default
    groups: []
notes: {}
node_order: {}
```

For a new project, replace the name and timestamps. Use the current time for `created` and `modified`.

### Metadata and IDs

`meta.name` is a string. Use quoted ISO 8601 timestamp strings for `meta.created` and `meta.modified`.

Keep `created` unchanged when you edit a project. Update `modified` when you change its content.

Dimension IDs are keys in `dimensions`. Note IDs are keys in `notes`. Group IDs belong to group objects within a dimension.

Keep IDs stable when display names change. Each note ID and dimension ID must be unique in its mapping. Each group ID must be unique within its dimension.

For new IDs, use lowercase letters, digits, and hyphens. This convention prevents ambiguity in `node_order` keys. Reserve `ungrouped` and `__ungrouped` for the plugin.

### Dimensions and groups

Each dimension contains a `name` string and a `groups` array. An empty dimension uses `groups: []`.

For a new project, include at least one dimension. The editor needs an active dimension to create nodes and groups.

Each group contains these fields:

| Field | Value |
| --- | --- |
| `id` | Stable group ID. |
| `name` | Display name as a string. |
| `x` | A stop name from `x-spectrum`, or `null`. |
| `y` | A stop name from `y-spectrum`, or `null`. |

A dimension can also contain `x-spectrum` and `y-spectrum`. Omit a spectrum field when that axis has no scale.

Each spectrum contains a `name` string, a `poles` array with exactly two strings, and a nonempty `stops` array.

Use distinct, nonempty strings for the stops. Array order controls their order on the canvas. Pole strings are display labels. Groups refer to stop strings, which can differ from the pole labels.

```yaml
alignment:
  name: Political Alignment
  x-spectrum:
    name: Authority
    poles: [Rebel, Crown]
    stops: [rebel, neutral, crown]
  groups:
    - id: royal-court
      name: Royal Court
      x: crown
      y: null
```

This fragment belongs inside `dimensions`. It has one horizontal spectrum and one group.

Set each group position to a valid stop on each active spectrum when placement on the scale matters. Groups with missing positions appear outside the spectrum grid.

### Notes

Each note contains these fields:

| Field | Value |
| --- | --- |
| `title` | Display title as a string. |
| `short` | Short description as a string. The card renders Markdown. |
| `long` | Long description as a string. The current editor has no pane for this content. |
| `membership` | A mapping from dimension IDs to group IDs or `null`. |
| `connections` | A mapping from dimension IDs to arrays of outgoing connections. |
| `width` | Optional card width in pixels. |

Use `""` for empty descriptions. Use YAML block scalars, such as `|`, for multiline Markdown. Use `{}` for empty membership or connection mappings.

A note can belong to at most one group per dimension. A missing membership entry and an explicit `null` each mean ungrouped. Every non-null membership must identify a group in that dimension.

For a custom width, write an integer from 120 to 600. Omit `width` for the default of 200. These limits match the resize control. The file reader does not clamp values.

### Connections

Put each connection inside its source note at `connections.<dimension-id>`. Each entry contains a `to` note ID and a `label` string or `null`.

```yaml
kira:
  title: Kira Thornwood
  short: A blacksmith with fire magic.
  long: ""
  membership:
    narrative: protagonists
  connections:
    narrative:
      - to: elena
        label: trained by
      - to: elena
        label: trusts
```

This fragment belongs inside `notes`. It requires the `narrative` dimension, its `protagonists` group, and the `elena` note elsewhere in the project.

The source is the enclosing note ID. Each `to` value must identify an existing note. Each connection dimension must exist in `dimensions`.

Keep duplicate connections when they express the intended relationships. For a reverse connection, add an outgoing entry to the other note. A self-connection can refer to its own note ID.

The canvas combines connections between the same notes into a curve. The file still stores each connection separately. Preserve their direction, labels, and counts during edits.

### Note order

Use `node_order` to set the order inside named groups:

```yaml
node_order:
  "narrative:protagonists": [kira]
  "narrative:supporting": [elena, marcus]
```

Each key combines a dimension ID, a colon, and a group ID. Each value is an array of note IDs.

List only notes that belong to that group in that dimension. List each note at most once. The layout appends group members absent from the array in note mapping order.

The layout ignores `node_order` entries for ungrouped notes. Preserve such entries in existing files, but do not use them to promise a display order.

## Edit a project

Read the existing file before you change it. Preserve content and fields outside the requested change.

| Change | Reference updates |
| --- | --- |
| Rename a display name | Change `name` or `title`. Keep its ID. |
| Move a note | Change its membership in the target dimension. Update the affected group order arrays. |
| Delete a note | Remove its object, incoming connections, and entries in all order arrays. |
| Delete a group | Set its memberships to `null`. Remove its group object and order entry. |
| Delete a dimension | Remove the dimension and its entries in all memberships, connections, and order keys. |
| Rename a stop | Change the stop string and each group position that refers to it on that axis. |
| Remove a spectrum | Remove its field. Set each group position on that axis to `null`. |

If the user requests an ID change, update every reference to that ID in the same edit. Group references depend on their dimension.

For a connection edit, identify its source, dimension, target, and label. If duplicates exist, change only the intended entries.

## File checks

The plugin parses YAML but does not fully check the schema. A successful parse alone does not prove that a file is correct.

Before you deliver a new or edited file:

1. Parse the YAML with a parser that rejects duplicate mapping keys.
2. Make sure the four top-level fields exist with the types described above.
3. Make sure timestamps remain strings and description fields contain strings.
4. Make sure IDs are unique within their scope.
5. Make sure memberships refer to existing dimensions and groups.
6. Make sure connection dimensions and target notes exist.
7. Make sure spectrum poles, stops, and group positions meet the rules above.
8. Make sure custom widths are integers from 120 to 600.
9. Make sure order entries contain distinct notes from the specified group.
10. Serialize the project.
11. Parse the serialized YAML.
12. Compare the parsed data before and after serialization.

Use `js-yaml` from the repository when you work in this project. The writer in `src/utils/helpers.ts` uses `lineWidth: -1`, `noRefs: true`, and `sortKeys: false`.

Quote timestamps so the parser keeps them as strings. Use explicit `null` values where the format calls for them. Keep mapping order when it affects the display.

Do not add node coordinates, viewport settings, focus state, selections, or undo history to the project data. The plugin calculates layout and keeps interface state separately.

Deliver the `.viewpoint` file and a short account of the changes and checks.
