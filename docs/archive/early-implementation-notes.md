> Historical project notes. These describe an earlier implementation and are not current documentation. See [README](../../README.md).

* Connection SVG layer — addConnection() is called, data is stored, but no visual rendering of edges/arrows exists
* Long description editor pane — ui.editingLongId is set on dblclick, but no right pane component reads it or shows a markdown editor
* Clipboard paste — copy/cut populate ui.clipboardNodeIds, but there's no Ctrl+V handler that creates nodes from clipboard
* Focus-driven layout — ui.focusPrimaryId/focusSecondaryId are set, but layoutEngine ignores them entirely (no recentering, no opacity propagation, no adjacency ordering)
* Dual focus path rendering — secondary focus is stored but no shortest-path computation or path visualization exists
* Node drag reordering — no drag handlers exist; nodes can't be reordered within groups or dragged between groups
* Node drag out of group — no way to remove a node from a group by dragging to empty space
* Group rename — no dblclick handler on group label, no inline editing for NodeGroup
* Group delete — no selection/delete mechanism for groups
* Connection label editing — no click-on-connection interaction (no connection visuals to click on)
* Connection delete — same, no selectable connection representation
* Opacity/fade system — no opacity computation based on focus distance or connection hops
* Node title inline rename — updateNodeTitle exists in store but nothing triggers it from UI
* Ctrl+V paste at cursor — canvas provides world coords but no paste handler uses them
* Group creation dialog — Ctrl+G creates with hardcoded "New Group" name, no naming prompt

