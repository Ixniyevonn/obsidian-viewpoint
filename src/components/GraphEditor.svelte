<script lang="ts">
  import type { App, Component } from "obsidian";
  import { onMount } from "svelte";
  import type DimGraphPlugin from "../main";
  import type { ProjectStore } from "../stores/project.svelte";
  import { createUiStore } from "../stores/ui.svelte";
  import type { Dimension, ProjectData, Spectrum } from "../types";
  import { generateId } from "../utils/helpers";
  import {
    groupStopCount,
    groupStopIndices,
    groupStopSetFromIndices,
    shiftGroupStopSet,
    toggleGroupStopRun,
  } from "../utils/groupStops";
  import { layoutEngine } from "../utils/layout";
  import { collectTagSuggestions } from "../utils/tags";
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

  let dialogMode = $state<"create" | "edit" | null>(null);

  // --- Measured DOM heights for accurate layout ---
  let measuredHeights = $state<Record<string, number>>({});

  function handleNodeMeasured(id: string, h: number) {
    // Only update if changed to avoid infinite reactivity loops
    if (measuredHeights[id] !== h) {
      measuredHeights[id] = h;

    }
  }

  $effect(() => {
    ui.reconcile(Object.keys(project.project.dimensions));
  });

  const layout = $derived(
    layoutEngine(project.project, ui.activeDimensionId, {
      fonts,
      measuredHeights,
    }),
  );

  const tagSuggestions = $derived(
    collectTagSuggestions(project.project.notes),
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
    for (const box of layout.groupBoxes) {
      if (
        wx >= box.x &&
        wx <= box.x + box.width &&
        wy >= box.y &&
        wy <= box.y + box.height
      ) {
        return box.groupId;
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
  let groupDragStartX = $state(0);
  let groupDragStartY = $state(0);
  let groupDragTracking = false;
  let groupDragTrackingId: string | null = null;
  let groupDragMode = $state<"move" | "toggle">("move");
  let groupDragAnchorXStop = $state<string | null>(null);
  let groupDragAnchorYStop = $state<string | null>(null);
  let groupToggleAxis = $state<"x" | "y" | null>(null);
  let groupToggleTargetStop = $state<string | null>(null);
  let groupMoveTargetXStop = $state<string | null>(null);
  let groupMoveTargetYStop = $state<string | null>(null);
  const GROUP_DRAG_THRESHOLD = 8;

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
      groupMoveTargetXStop = findNearestXStop(world.x);
      groupMoveTargetYStop = findNearestYStop(world.y);

      if (groupDragMode === "toggle") {
        const dx = Math.abs(world.x - groupDragStartX);
        const dy = Math.abs(world.y - groupDragStartY);
        if (layout.xSpectrum && dx >= dy) {
          groupToggleAxis = "x";
          groupToggleTargetStop = findNearestXStop(world.x);
        } else if (layout.ySpectrum) {
          groupToggleAxis = "y";
          groupToggleTargetStop = findNearestYStop(world.y);
        }
      }
    }
  }

  function handleGroupPointerDown(groupId: string, e: PointerEvent) {
    if (e.button !== 0 || !hasSpectra || groupId === "__ungrouped") return;
    const world = canvasRef?.clientToWorld(e.clientX, e.clientY) ?? {
      x: ui.cursorWorldX,
      y: ui.cursorWorldY,
    };
    groupDragTracking = true;
    groupDragTrackingId = groupId;
    groupDragStartX = world.x;
    groupDragStartY = world.y;
    groupDragAnchorXStop = findNearestXStop(world.x);
    groupDragAnchorYStop = findNearestYStop(world.y);
    groupDragMode = e.shiftKey ? "toggle" : "move";
  }

  /**
   * Compute the stop values that the group would have after this drag.
   *
   * @returns The wanted X and Y values, the changed axis, or null.
   */
  function computePendingGroupStops() {
    if (!draggingGroupId) return null;
    const dimId = ui.activeDimensionId;
    if (!dimId) return null;
    const dim = project.project.dimensions[dimId];
    const group = dim?.groups.find((g) => g.id === draggingGroupId);
    if (!dim || !group) return null;
    const xStops = dim["x-spectrum"]?.stops ?? null;
    const yStops = dim["y-spectrum"]?.stops ?? null;

    if (groupDragMode === "toggle") {
      const axis = groupToggleAxis;
      const target = groupToggleTargetStop;
      const anchor = axis === "x" ? groupDragAnchorXStop : groupDragAnchorYStop;
      const stops = axis === "x" ? xStops : yStops;
      if (!axis || !target || !anchor || !stops) return null;
      if (target === anchor) return null;
      const fromIndex = stops.indexOf(anchor);
      const toIndex = stops.indexOf(target);
      if (fromIndex < 0 || toIndex < 0) return null;
      const toggled = toggleGroupStopRun(group[axis], stops, fromIndex, toIndex);
      let x = axis === "x" ? toggled : group.x;
      let y = axis === "y" ? toggled : group.y;
      if (groupStopCount(x, xStops) > 1 && groupStopCount(y, yStops) > 1) {
        if (axis === "y") return null;
        y = groupStopSetFromIndices([groupStopIndices(y, yStops)[0]], yStops);
      }
      return { x, y, changed: axis };
    }

    let x = group.x;
    let y = group.y;
    if (xStops && groupDragAnchorXStop && groupMoveTargetXStop) {
      x = shiftGroupStopSet(
        group.x,
        xStops,
        groupDragAnchorXStop,
        groupMoveTargetXStop,
      );
    }
    if (yStops && groupDragAnchorYStop && groupMoveTargetYStop) {
      y = shiftGroupStopSet(
        group.y,
        yStops,
        groupDragAnchorYStop,
        groupMoveTargetYStop,
      );
    }
    return { x, y, changed: "both" as const };
  }

  const pendingGroupStops = $derived.by(computePendingGroupStops);

  /** Apply a finished group drag: move the group or toggle a stop run. */
  function commitGroupDrag() {
    const dimId = ui.activeDimensionId;
    const pending = computePendingGroupStops();
    if (!dimId || !draggingGroupId || !pending) return;
    project.moveGroup(
      dimId,
      draggingGroupId,
      pending.x,
      pending.y,
      pending.changed,
    );
  }

  function handlePointerUp(_e: PointerEvent) {
    if (ui.isDraggingNode && ui.draggingNodeId) {
      const nodeId = ui.draggingNodeId;
      const wx = ui.dragGhostX;
      const wy = ui.dragGhostY;

      let targetGroupId: string | null = null;
      for (const box of layout.groupBoxes) {
        if (box.groupId === "__ungrouped") continue;
        if (
          wx >= box.x &&
          wx <= box.x + box.width &&
          wy >= box.y &&
          wy <= box.y + box.height
        ) {
          targetGroupId = box.groupId;
          break;
        }
      }

      if (ui.activeDimensionId) {
        const dimId = ui.activeDimensionId;
        project.moveNoteToGroup(
          nodeId,
          dimId,
          targetGroupId,
          findNearestXStop(wx),
          findNearestYStop(wy),
        );
      }

      ui.endDrag();
    }

    if (draggingGroupId && ui.activeDimensionId && hasSpectra) {
      commitGroupDrag();
    }

    draggingGroupId = null;
    groupDragTracking = false;
    groupDragTrackingId = null;
    groupToggleAxis = null;
    groupToggleTargetStop = null;
    groupMoveTargetXStop = null;
    groupMoveTargetYStop = null;
  }

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
        groupToggleAxis = null;
        groupToggleTargetStop = null;
        groupMoveTargetXStop = null;
        groupMoveTargetYStop = null;
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

  /**
   * Return true when the event target can scroll or accepts text input.
   *
   * The wheel handler keeps its default action for these targets. The check
   * stops at the Viewpoint root.
   *
   * @param target - The event target.
   * @param root - The element with the wheel handler.
   * @returns True when the target is scrollable or an input field.
   */
  function targetIsScrollable(target: EventTarget | null, root: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    if (target.closest("input, textarea, [contenteditable='true']")) return true;
    let el: HTMLElement | null = target as HTMLElement;
    while (el) {
      if (el.scrollHeight > el.clientHeight) {
        const overflowY = getComputedStyle(el).overflowY;
        if (overflowY === "auto" || overflowY === "scroll") return true;
      }
      if (el === root) break;
      el = el.parentElement;
    }
    return false;
  }

  /**
   * Cycle dimensions on a plain wheel. Only the Viewpoint canvas receives this
   * handler, so a wheel over any other Obsidian pane scrolls that pane.
   */
  function onWheel(e: WheelEvent) {
    if (e.ctrlKey || dialogMode) return;
    if (targetIsScrollable(e.target, e.currentTarget)) return;
    const dimIds = Object.keys(project.project.dimensions);
    if (!dimIds.length) return;
    e.preventDefault();
    ui.cycle(dimIds, e.deltaY > 0 ? 1 : -1);
  }

  onMount(() => {
    if (canvasAreaEl) {
      fonts = detectFonts(canvasAreaEl);
    }
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

  /** Layout of the project after the current group drag, or null. */
  const previewLayout = $derived.by(() => {
    const pending = pendingGroupStops;
    const dimId = ui.activeDimensionId;
    if (!pending || !dimId || !draggingGroupId) return null;
    const dim = project.project.dimensions[dimId];
    if (!dim) return null;
    const previewProject: ProjectData = {
      ...project.project,
      dimensions: {
        ...project.project.dimensions,
        [dimId]: {
          ...dim,
          groups: dim.groups.map((g) =>
            g.id === draggingGroupId
              ? { ...g, x: pending.x, y: pending.y }
              : g,
          ),
        },
      },
    };
    return layoutEngine(previewProject, dimId, { fonts, measuredHeights });
  });

  const groupDragHint = $derived.by(() => {
    if (!draggingGroupId) return null;
    if (groupDragMode === "toggle") {
      const dx = Math.abs(groupDragGhostX - groupDragStartX);
      const dy = Math.abs(groupDragGhostY - groupDragStartY);
      if (layout.xSpectrum && dx >= dy) {
        const to = findNearestXStop(groupDragGhostX);
        if (groupDragAnchorXStop && to) {
          return `Shift-drag toggles X run: ${groupDragAnchorXStop} to ${to}`;
        }
      } else if (layout.ySpectrum) {
        const to = findNearestYStop(groupDragGhostY);
        if (groupDragAnchorYStop && to) {
          return `Shift-drag toggles Y run: ${groupDragAnchorYStop} to ${to}`;
        }
      }
      return "Shift-drag to span stops";
    }
    const xStop = findNearestXStop(groupDragGhostX);
    const yStop = findNearestYStop(groupDragGhostY);
    const parts: string[] = [];
    if (xStop) parts.push(`X: ${xStop}`);
    if (yStop) parts.push(`Y: ${yStop}`);
    if (parts.length === 0) return null;
    return `Drop to place at ${parts.join(" ")}`;
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
    for (const box of layout.groupBoxes) {
      if (box.groupId === "__ungrouped") continue;
      if (
        wx >= box.x &&
        wx <= box.x + box.width &&
        wy >= box.y &&
        wy <= box.y + box.height
      ) {
        return box.groupId;
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
  onwheel={onWheel}
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

    {#if draggingGroupId && groupDragHint}
      <div class="connection-hint snap-hint">
        {groupDragHint}
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

      {#if previewLayout}
        {#each previewLayout.groupBoxes as box (box.groupId + ":" + box.x + ":" + box.y)}
          <div
            class="preview-group"
            style:left="{box.x}px"
            style:top="{box.y}px"
            style:width="{box.width}px"
            style:height="{box.height}px"
            style:--group-color={box.color ? `var(${box.color})` : undefined}
          >
            <span class="preview-group-label">{box.name}</span>
          </div>
        {/each}
      {:else}
        {#each layout.groupBoxes as box (box.groupId + ":" + box.x + ":" + box.y)}
          <NodeGroup
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            name={box.name}
            color={box.color}
            highlight={dropTargetGroupId === box.groupId}
            selected={ui.isGroupSelected(box.groupId)}
            draggable={hasSpectra && box.groupId !== "__ungrouped"}
            beingDragged={draggingGroupId === box.groupId}
            onSelect={(e) => handleGroupSelect(box.groupId, e)}
            onRename={ui.activeDimensionId
              ? (newName) => handleGroupRename(box.groupId, newName)
              : undefined}
            onDragStart={(e) => handleGroupPointerDown(box.groupId, e)}
          />
        {/each}
      {/if}

      <SVGLayer {project} {ui} layout={previewLayout ?? layout} />

      {#if previewLayout}
        {#each Object.entries(previewLayout.nodes) as [noteId, pos] (noteId)}
          <div
            class="preview-node"
            style:left="{pos.x}px"
            style:top="{pos.y}px"
            style:width="{pos.width}px"
            style:min-height="{pos.height}px"
          >
            <span class="preview-node-title">{project.project.notes[noteId].title}</span>
          </div>
        {/each}
      {:else}
        {#each Object.entries(layout.nodes) as [noteId, pos] (noteId)}
          <NodeCard
            width={pos.width}
            columnWidths={Object.entries(layout.nodes)
              .filter(([id, node]) => id !== noteId && Math.abs(node.x - pos.x) < 1)
              .map(([, node]) => node.width)}
            height={pos.height}
            x={pos.x}
            y={pos.y}
            {app}
            {noteId}
            title={project.project.notes[noteId].title}
            short={project.project.notes[noteId].short}
            long={project.project.notes[noteId].long}
            tags={project.project.notes[noteId].tags ?? []}
            suggestions={tagSuggestions}
            {parentComponent}
            {ui}
            {project}
            onMeasured={handleNodeMeasured}
          />
        {/each}
      {/if}

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

      {#if groupSnapTarget}
        <svg
          class="snap-crosshair"
          aria-hidden="true"
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
  .preview-group {
    position: absolute;
    box-sizing: border-box;
    border: 2px dashed var(--interactive-accent);
    border-radius: var(--radius-m);
    background: color-mix(
      in srgb,
      var(--group-color, var(--interactive-accent)) 12%,
      transparent
    );
    pointer-events: none;
    z-index: 90;
  }
  .preview-group-label {
    display: block;
    padding: 8px 12px;
    font-size: 24px;
    font-weight: 700;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .preview-node {
    position: absolute;
    box-sizing: border-box;
    display: flex;
    align-items: flex-start;
    padding: 8px 16px;
    background: color-mix(
      in srgb,
      var(--background-primary) 70%,
      transparent
    );
    border: 2px dashed var(--interactive-accent);
    border-radius: var(--radius-m);
    opacity: 0.85;
    pointer-events: none;
    z-index: 91;
  }
  .preview-node-title {
    font-size: 20px;
    font-weight: 700;
    color: var(--text-normal);
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
