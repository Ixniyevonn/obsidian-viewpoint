<script lang="ts">
  import type { App, Component } from "obsidian";
  import { onMount } from "svelte";
  import type DimGraphPlugin from "../main";
  import type { ProjectStore } from "../stores/project.svelte";
  import { createUiStore } from "../stores/ui.svelte";
  import { generateId } from "../utils/helpers";
  import { layoutEngine } from "../utils/layout";
  import AxisSwitcher from "./AxisSwitcher.svelte";
  import Canvas from "./Canvas.svelte";
  import NodeCard from "./NodeCard.svelte";
  import NodeGroup from "./NodeGroup.svelte";
  import SVGLayer from "./SVGLayer.svelte";

  interface Props {
    app: App;
    plugin: DimGraphPlugin;
    project: ProjectStore;
    parentComponent: Component;
  }

  const { app, plugin, project, parentComponent }: Props = $props();

  const ui = createUiStore();

  let canvasRef: Canvas | undefined = $state();

  $effect(() => {
    ui.reconcile(Object.keys(project.project.dimensions));
  });

  const layout = $derived(layoutEngine(project.project, ui.activeDimensionId));

  // --- Helpers ---

  /** Find which group (if any) contains the given world-space point. */
  function groupAtPoint(wx: number, wy: number): string | null {
    for (const [groupId, g] of Object.entries(layout.groups)) {
      if (
        wx >= g.x &&
        wx <= g.x + g.width &&
        wy >= g.y &&
        wy <= g.y + g.height
      ) {
        return groupId;
      }
    }
    return null;
  }

  // --- Canvas callbacks ---

  function handleEmptyDblClick(worldX: number, worldY: number) {
    const hitGroup = groupAtPoint(worldX, worldY);

    if (hitGroup) {
      // Double-clicked inside a group → create node in that group
      const id = generateId("note");
      project.addNote(id, "Untitled");
      if (ui.activeDimensionId && hitGroup !== "__ungrouped") {
        project.setNoteMembership(id, ui.activeDimensionId, hitGroup);
      }
      ui.selectNode(id, false);
    } else {
      // Double-clicked true empty space → create a new group
      if (ui.activeDimensionId) {
        const groupId = generateId("grp");
        project.addGroup(ui.activeDimensionId, groupId, "New Group");
        ui.selectGroup(groupId, false);
      }
    }
  }

  function handleEmptyClick() {
    if (ui.connectingFromId) {
      ui.cancelConnection();
      return;
    }
    if (ui.isRetargeting) {
      ui.cancelRetarget();
      return;
    }
    ui.clearPendingDelete();
    ui.clearSelection();
    ui.editingShortId = null;
  }

  // --- Group selection ---

  function handleGroupSelect(groupId: string, e: MouseEvent) {
    if (groupId === "__ungrouped") return;
    ui.clearPendingDelete();
    ui.selectGroup(groupId, e.shiftKey);
  }

  // --- Track cursor in world space + update drag ghost ---

  function handlePointerMove(e: PointerEvent) {
    if (!canvasRef) return;
    const world = canvasRef.clientToWorld(e.clientX, e.clientY);
    ui.updateCursor(world.x, world.y);

    if (ui.isDraggingNode) {
      ui.updateDrag(world.x, world.y);
    }
  }

  function handlePointerUp(_e: PointerEvent) {
    if (!ui.isDraggingNode || !ui.draggingNodeId) return;

    const nodeId = ui.draggingNodeId;
    const wx = ui.dragGhostX;
    const wy = ui.dragGhostY;

    let targetGroupId: string | null = null;
    for (const [groupId, g] of Object.entries(layout.groups)) {
      if (groupId === "__ungrouped") continue;
      if (
        wx >= g.x &&
        wx <= g.x + g.width &&
        wy >= g.y &&
        wy <= g.y + g.height
      ) {
        targetGroupId = groupId;
        break;
      }
    }

    if (ui.activeDimensionId) {
      project.setNoteMembership(nodeId, ui.activeDimensionId, targetGroupId);
    }

    ui.endDrag();
  }

  // --- Rename handler for groups (including __ungrouped) ---

  function handleGroupRename(groupId: string, newName: string) {
    const dimId = ui.activeDimensionId;
    if (!dimId) return;

    if (groupId === "__ungrouped") {
      const newGroupId = generateId("grp");
      project.addGroup(dimId, newGroupId, newName);

      const notes = project.project.notes;
      for (const noteId of Object.keys(notes)) {
        const membership = notes[noteId].membership[dimId];
        if (membership === null || membership === undefined) {
          project.setNoteMembership(noteId, dimId, newGroupId);
        }
      }
    } else {
      project.renameGroup(dimId, groupId, newName);
    }
  }

  // --- Keyboard shortcuts ---

  function handleKeydown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    const inInput = tag === "INPUT" || tag === "TEXTAREA";

    if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.altKey) {
      if (e.shiftKey) {
        e.preventDefault();
        project.performRedo();
      } else {
        e.preventDefault();
        project.performUndo();
      }
      return;
    }

    if (e.key === "y" && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      project.performRedo();
      return;
    }

    if (inInput) return;

    if (e.key === "Escape") {
      if (ui.isDraggingNode) {
        ui.endDrag();
      } else if (ui.connectingFromId) {
        ui.cancelConnection();
      } else if (ui.isRetargeting) {
        ui.cancelRetarget();
      } else if (ui.pendingDeleteIndex !== null) {
        ui.clearPendingDelete();
      } else if (ui.editingShortId || ui.editingLongId) {
        ui.editingShortId = null;
        ui.editingLongId = null;
      } else if (ui.hasSelection) {
        ui.clearSelection();
      } else {
        ui.clearFocus();
      }
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      if (ui.hasSelection) {
        e.preventDefault();
        for (const id of ui.selectedNodeIds) {
          project.removeNote(id);
        }
        if (ui.activeDimensionId) {
          for (const gid of ui.selectedGroupIds) {
            project.removeGroup(ui.activeDimensionId, gid);
          }
        }
        ui.clearSelection();
      }
      return;
    }

    if (e.key === "c" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      if (ui.selectedNodeIds.size > 0) {
        ui.copyNodes([...ui.selectedNodeIds]);
      }
      return;
    }

    if (e.key === "x" && (e.ctrlKey || e.metaKey)) {
      if (ui.selectedNodeIds.size > 0) {
        e.preventDefault();
        const ids = [...ui.selectedNodeIds];
        ui.cutNodes(ids);
        for (const id of ids) {
          project.removeNote(id);
        }
        ui.clearSelection();
      }
      return;
    }

    if (e.key === "g" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!ui.activeDimensionId) return;

      const groupId = generateId("grp");
      project.addGroup(ui.activeDimensionId, groupId, "New Group");

      for (const nodeId of ui.selectedNodeIds) {
        project.setNoteMembership(nodeId, ui.activeDimensionId, groupId);
      }
      return;
    }

    if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const allNodeIds = Object.keys(project.project.notes);
      for (const id of allNodeIds) {
        ui.selectNode(id, true);
      }
      const dim = ui.activeDimensionId
        ? project.project.dimensions[ui.activeDimensionId]
        : null;
      if (dim) {
        for (const g of dim.groups) {
          ui.selectGroup(g.id, true);
        }
      }
      return;
    }
  }

  // --- Scroll-wheel axis switching ---

  function onWheel(e: WheelEvent) {
    if (e.ctrlKey) return;
    const dimIds = Object.keys(project.project.dimensions);
    if (!dimIds.length) return;
    e.preventDefault();
    ui.cycle(dimIds, e.deltaY > 0 ? 1 : -1);
  }

  onMount(() => {
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  });

  // --- Drag ghost derived ---
  const dragGhost = $derived.by(() => {
    if (!ui.draggingNodeId) return null;
    const nodeLayout = layout.nodes[ui.draggingNodeId];
    const note = project.project.notes[ui.draggingNodeId];
    if (!nodeLayout || !note) return null;
    return {
      x: ui.dragGhostX - nodeLayout.width / 2,
      y: ui.dragGhostY - nodeLayout.height / 2,
      width: nodeLayout.width,
      height: nodeLayout.height,
      title: note.title,
    };
  });

  // --- Highlight group under drag cursor ---
  const dropTargetGroupId = $derived.by(() => {
    if (!ui.isDraggingNode) return null;
    const wx = ui.dragGhostX;
    const wy = ui.dragGhostY;
    for (const [groupId, g] of Object.entries(layout.groups)) {
      if (groupId === "__ungrouped") continue;
      if (
        wx >= g.x &&
        wx <= g.x + g.width &&
        wy >= g.y &&
        wy <= g.y + g.height
      ) {
        return groupId;
      }
    }
    return null;
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="dim-graph-root"
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
>
  <div class="canvas-area">
    <AxisSwitcher {project} {ui} />

    {#if ui.connectingFromId}
      <div class="connection-hint">
        Right-clicked node selected — click another node to connect, or click
        empty space / Esc to cancel
      </div>
    {/if}

    {#if ui.isRetargeting}
      <div class="connection-hint retarget-hint">
        Retargeting {ui.retargetEnd} — click a node to reconnect, or Esc to cancel
      </div>
    {/if}

    {#if ui.pendingDeleteIndex !== null}
      <div class="connection-hint delete-hint">
        Click the red connection to delete, or Esc to cancel
      </div>
    {/if}

    <Canvas
      bind:this={canvasRef}
      onEmptyDblClick={handleEmptyDblClick}
      onEmptyClick={handleEmptyClick}
    >
      {#each Object.entries(layout.groups) as [groupId, g]}
        <NodeGroup
          x={g.x}
          y={g.y}
          width={g.width}
          height={g.height}
          name={g.name}
          highlight={dropTargetGroupId === groupId}
          selected={ui.isGroupSelected(groupId)}
          onSelect={(e) => handleGroupSelect(groupId, e)}
          onRename={ui.activeDimensionId
            ? (newName) => handleGroupRename(groupId, newName)
            : undefined}
        />
      {/each}

      <SVGLayer {project} {ui} {layout} />

      {#each Object.entries(layout.nodes) as [noteId, pos] (noteId)}
        <NodeCard
          width={pos.width}
          height={pos.height}
          x={pos.x}
          y={pos.y}
          {app}
          {noteId}
          title={project.project.notes[noteId].title}
          short={project.project.notes[noteId].short}
          long={project.project.notes[noteId].long}
          {parentComponent}
          {ui}
          {project}
        />
      {/each}

      {#if dragGhost}
        <div
          class="drag-ghost"
          style:left="{dragGhost.x}px"
          style:top="{dragGhost.y}px"
          style:width="{dragGhost.width}px"
          style:min-height="{dragGhost.height}px"
        >
          <h1>{dragGhost.title}</h1>
        </div>
      {/if}
    </Canvas>
  </div>
</div>

<style>
  :global(.view-content) {
    padding: 0 !important;
  }
  .dim-graph-root {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .canvas-area {
    flex: 1;
    position: relative;
    background: var(--background-primary);
    overflow: hidden;
  }
  .connection-hint {
    position: absolute;
    bottom: 12px;
    left: 50%;
    translate: -50% 0;
    z-index: 10;
    padding: 6px 16px;
    background: var(--background-secondary);
    border: 1px solid var(--color-green);
    border-radius: var(--radius-m);
    color: var(--text-muted);
    font-size: var(--font-ui-small);
    pointer-events: none;
    opacity: 0.9;
    white-space: nowrap;
  }
  .retarget-hint {
    border-color: var(--color-orange);
    bottom: 40px;
  }
  .delete-hint {
    border-color: var(--color-red);
    bottom: 40px;
  }
  .drag-ghost {
    position: absolute;
    padding: 8px 16px;
    background-color: var(--background-primary);
    border-radius: var(--radius-m);
    border: 2px solid var(--interactive-accent);
    box-shadow:
      var(--shadow-stationary),
      0 0 0 2px var(--interactive-accent);
    opacity: 0.7;
    pointer-events: none;
    z-index: 100;
  }
</style>
