<script lang="ts">
  import type { App, Component } from "obsidian";
  import { onMount } from "svelte";
  import type DimGraphPlugin from "../main";
  import type { ProjectStore } from "../stores/project.svelte";
  import { createUiStore } from "../stores/ui.svelte";
  import type { Dimension, Spectrum } from "../types";
  import { generateId } from "../utils/helpers";
  import { layoutEngine } from "../utils/layout";
  import type { FontConfig } from "../utils/textMeasure";
  import { DEFAULT_FONTS, detectFonts } from "../utils/textMeasure";
  import AxisSwitcher from "./AxisSwitcher.svelte";
  import Canvas from "./Canvas.svelte";
  import DimensionDialog from "./DimensionDialog.svelte";
  import NodeCard from "./NodeCard.svelte";
  import NodeGroup from "./NodeGroup.svelte";
  import SpectrumOverlay from "./SpectrumOverlay.svelte";
  import SVGLayer from "./SVGLayer.svelte";

  interface Props {
    app: App;
    plugin: DimGraphPlugin;
    project: ProjectStore;
    parentComponent: Component;
  }

  const { app, plugin, project, parentComponent }: Props = $props();

  const ui = createUiStore();
  let fonts: FontConfig = $state(DEFAULT_FONTS);
  let canvasAreaEl: HTMLDivElement | undefined = $state();
  let canvasRef: Canvas | undefined = $state();

  // --- Dimension dialog state ---
  let dialogMode = $state<"create" | "edit" | null>(null);

  $effect(() => {
    ui.reconcile(Object.keys(project.project.dimensions));
  });

  const layout = $derived(
    layoutEngine(project.project, ui.activeDimensionId, { fonts }),
  );

  const activeDim = $derived(
    ui.activeDimensionId
      ? project.project.dimensions[ui.activeDimensionId]
      : null,
  );
  const hasSpectra = $derived(
    !!activeDim?.["x-spectrum"] || !!activeDim?.["y-spectrum"],
  );

  // --- Helpers ---

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

  function findNearestXStop(wx: number): string | null {
    if (!layout.xSpectrum) return null;
    let best: string | null = null;
    let bestDist = Infinity;
    for (const stop of layout.xSpectrum.stops) {
      const d = Math.abs(stop.position - wx);
      if (d < bestDist) {
        bestDist = d;
        best = stop.name;
      }
    }
    return best;
  }

  function findNearestYStop(wy: number): string | null {
    if (!layout.ySpectrum) return null;
    let best: string | null = null;
    let bestDist = Infinity;
    for (const stop of layout.ySpectrum.stops) {
      const d = Math.abs(stop.position - wy);
      if (d < bestDist) {
        bestDist = d;
        best = stop.name;
      }
    }
    return best;
  }

  // --- Canvas callbacks ---

  function handleEmptyDblClick(worldX: number, worldY: number) {
    if (!ui.activeDimensionId) return;

    const hitGroup = groupAtPoint(worldX, worldY);

    if (hitGroup) {
      const id = generateId("note");
      project.addNote(id, "Untitled");
      if (hitGroup !== "__ungrouped") {
        project.setNoteMembership(id, ui.activeDimensionId, hitGroup);
      }
      ui.selectNode(id, false);
    } else {
      // No group hit — create a new group at this position
      const groupId = generateId("grp");
      project.addGroup(ui.activeDimensionId, groupId, "New Group");

      if (hasSpectra) {
        const xStop = findNearestXStop(worldX);
        const yStop = findNearestYStop(worldY);
        if (xStop !== null) {
          project.setGroupStop(ui.activeDimensionId, groupId, "x", xStop);
        }
        if (yStop !== null) {
          project.setGroupStop(ui.activeDimensionId, groupId, "y", yStop);
        }
      }

      ui.selectGroup(groupId, false);
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

  // --- Group dragging state ---
  let draggingGroupId = $state<string | null>(null);
  let groupDragGhostX = $state(0);
  let groupDragGhostY = $state(0);
  let groupDragStartX = 0;
  let groupDragStartY = 0;
  let groupDragTracking = false;
  let groupDragTrackingId: string | null = null;
  const GROUP_DRAG_THRESHOLD = 8;

  // --- Track cursor in world space + update drag ghost ---

  function handlePointerMove(e: PointerEvent) {
    if (!canvasRef) return;
    const world = canvasRef.clientToWorld(e.clientX, e.clientY);
    ui.updateCursor(world.x, world.y);

    if (ui.isDraggingNode) {
      ui.updateDrag(world.x, world.y);
    }

    if (groupDragTracking && !draggingGroupId) {
      const dx = world.x - groupDragStartX;
      const dy = world.y - groupDragStartY;
      if (dx * dx + dy * dy > GROUP_DRAG_THRESHOLD * GROUP_DRAG_THRESHOLD) {
        draggingGroupId = groupDragTrackingId;
        groupDragTracking = false;
      }
    }

    if (draggingGroupId) {
      groupDragGhostX = world.x;
      groupDragGhostY = world.y;
    }
  }

  function handleGroupPointerDown(groupId: string, e: PointerEvent) {
    if (e.button !== 0 || !hasSpectra || groupId === "__ungrouped") return;
    groupDragTracking = true;
    groupDragTrackingId = groupId;
    groupDragStartX = ui.cursorWorldX;
    groupDragStartY = ui.cursorWorldY;
  }

  function handlePointerUp(_e: PointerEvent) {
    // Node drag
    if (ui.isDraggingNode && ui.draggingNodeId) {
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

    // Group drag (spectrum repositioning)
    if (draggingGroupId && ui.activeDimensionId && hasSpectra) {
      const xStop = findNearestXStop(groupDragGhostX);
      const yStop = findNearestYStop(groupDragGhostY);

      if (layout.xSpectrum && xStop !== null) {
        project.setGroupStop(ui.activeDimensionId, draggingGroupId, "x", xStop);
      }
      if (layout.ySpectrum && yStop !== null) {
        project.setGroupStop(ui.activeDimensionId, draggingGroupId, "y", yStop);
      }
    }

    draggingGroupId = null;
    groupDragTracking = false;
    groupDragTrackingId = null;
  }

  // --- Rename handler for groups ---

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

  // --- Dimension dialog ---

  function handleOpenDialog(mode: "create" | "edit") {
    dialogMode = mode;
  }

  function handleDialogConfirm(
    name: string,
    xSpectrum: Spectrum | null,
    ySpectrum: Spectrum | null,
  ) {
    if (dialogMode === "create") {
      const id = generateId("dim");
      project.addDimension(id, name, xSpectrum, ySpectrum);
      ui.activeDimensionId = id;
    } else if (dialogMode === "edit" && ui.activeDimensionId) {
      project.updateDimension(ui.activeDimensionId, name, xSpectrum, ySpectrum);
    }
    dialogMode = null;
  }

  function handleDialogCancel() {
    dialogMode = null;
  }

  const dialogExisting: Dimension | null = $derived(
    dialogMode === "edit" && ui.activeDimensionId
      ? (project.project.dimensions[ui.activeDimensionId] ?? null)
      : null,
  );

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
      if (dialogMode) {
        dialogMode = null;
        return;
      }
      if (draggingGroupId) {
        draggingGroupId = null;
        groupDragTracking = false;
        return;
      }
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
    // Don't cycle dimensions when dialog is open or ctrl-zooming
    if (e.ctrlKey || dialogMode) return;
    const dimIds = Object.keys(project.project.dimensions);
    if (!dimIds.length) return;
    e.preventDefault();
    ui.cycle(dimIds, e.deltaY > 0 ? 1 : -1);
  }

  onMount(() => {
    window.addEventListener("wheel", onWheel, { passive: false });
    if (canvasAreaEl) {
      fonts = detectFonts(canvasAreaEl);
    }
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

  const groupDragGhost = $derived.by(() => {
    if (!draggingGroupId) return null;
    const gl = layout.groups[draggingGroupId];
    if (!gl) return null;
    return {
      x: groupDragGhostX - gl.width / 2,
      y: groupDragGhostY - gl.height / 2,
      width: gl.width,
      height: gl.height,
      name: gl.name,
    };
  });

  const groupSnapTarget = $derived.by(() => {
    if (!draggingGroupId || !hasSpectra) return null;
    const xStop = findNearestXStop(groupDragGhostX);
    const yStop = findNearestYStop(groupDragGhostY);
    if (!xStop && !yStop) return null;

    let x: number | null = null;
    let y: number | null = null;
    if (layout.xSpectrum && xStop) {
      const s = layout.xSpectrum.stops.find((s) => s.name === xStop);
      if (s) x = s.position;
    }
    if (layout.ySpectrum && yStop) {
      const s = layout.ySpectrum.stops.find((s) => s.name === yStop);
      if (s) y = s.position;
    }
    return { x, y, xStop, yStop };
  });

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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="dim-graph-root"
  role="application"
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
>
  <div class="canvas-area" bind:this={canvasAreaEl}>
    <AxisSwitcher {project} {ui} onOpenDialog={handleOpenDialog} />

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

    {#if draggingGroupId && groupSnapTarget}
      <div class="connection-hint snap-hint">
        Drop to place at{groupSnapTarget.xStop
          ? ` X: ${groupSnapTarget.xStop}`
          : ""}{groupSnapTarget.yStop ? ` Y: ${groupSnapTarget.yStop}` : ""}
      </div>
    {/if}

    <Canvas
      bind:this={canvasRef}
      onEmptyDblClick={handleEmptyDblClick}
      onEmptyClick={handleEmptyClick}
    >
      <SpectrumOverlay
        xSpectrum={layout.xSpectrum}
        ySpectrum={layout.ySpectrum}
      />

      {#each Object.entries(layout.groups) as [groupId, g]}
        <NodeGroup
          x={g.x}
          y={g.y}
          width={g.width}
          height={g.height}
          name={g.name}
          highlight={dropTargetGroupId === groupId}
          selected={ui.isGroupSelected(groupId)}
          draggable={hasSpectra && groupId !== "__ungrouped"}
          beingDragged={draggingGroupId === groupId}
          onSelect={(e) => handleGroupSelect(groupId, e)}
          onRename={ui.activeDimensionId
            ? (newName) => handleGroupRename(groupId, newName)
            : undefined}
          onDragStart={(e) => handleGroupPointerDown(groupId, e)}
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

      {#if groupDragGhost}
        <div
          class="drag-ghost group-drag-ghost"
          style:left="{groupDragGhost.x}px"
          style:top="{groupDragGhost.y}px"
          style:width="{groupDragGhost.width}px"
          style:min-height="{groupDragGhost.height}px"
        >
          <span class="group-drag-label">{groupDragGhost.name}</span>
        </div>
      {/if}

      {#if groupSnapTarget}
        <svg
          class="snap-crosshair"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1 1"
        >
          {#if groupSnapTarget.x !== null}
            <line
              x1={groupSnapTarget.x}
              y1={groupDragGhostY - 200}
              x2={groupSnapTarget.x}
              y2={groupDragGhostY + 200}
              class="snap-line"
            />
          {/if}
          {#if groupSnapTarget.y !== null}
            <line
              x1={groupDragGhostX - 200}
              y1={groupSnapTarget.y}
              x2={groupDragGhostX + 200}
              y2={groupSnapTarget.y}
              class="snap-line"
            />
          {/if}
        </svg>
      {/if}
    </Canvas>
  </div>
</div>

{#if dialogMode}
  <DimensionDialog
    existing={dialogExisting}
    onConfirm={handleDialogConfirm}
    onCancel={handleDialogCancel}
  />
{/if}

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
  .snap-hint {
    border-color: var(--interactive-accent);
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
  .group-drag-ghost {
    background-color: var(--background-secondary);
    border: 2px dashed var(--interactive-accent);
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
  }
  .group-drag-label {
    font-size: 20px;
    font-weight: 700;
    color: var(--text-muted);
    opacity: 0.8;
  }

  .snap-crosshair {
    position: absolute;
    top: 0;
    left: 0;
    width: 1px;
    height: 1px;
    overflow: visible;
    pointer-events: none;
    z-index: 99;
  }
  .snap-line {
    stroke: var(--interactive-accent);
    stroke-width: 1;
    stroke-dasharray: 6 4;
    opacity: 0.5;
  }
</style>
