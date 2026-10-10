<script lang="ts">
  import type { App, Component, WorkspaceLeaf } from "obsidian";
  import { Menu } from "obsidian";
  import { onDestroy, onMount } from "svelte";
  import type DimGraphPlugin from "../main";
  import type { ProjectStore } from "../stores/project.svelte";
  import { createUiStore } from "../stores/ui.svelte";
  import type { ClipboardNote, Dimension, GroupCell, Note, ProjectData, Spectrum } from "../types";
  import { generateId } from "../utils/helpers";
  import {
    addCellIndex,
    cellsToIndices,
    clearNotePlacement,
    decomposeGroupRuns,
    indicesToCells,
    placeNoteInGroup,
    resizeRunCells,
    shiftRunCells,
    type CellIndex,
    type GroupRun,
  } from "../utils/groupStops";
  import { layoutEngine } from "../utils/layout";
  import { collectTagSuggestions } from "../utils/tags";
  import {
    rectsIntersect,
    viewportRect,
    type Viewport,
  } from "../utils/viewport";
  import type { FontConfig } from "../utils/textMeasure";
  import { DEFAULT_FONTS, detectFonts } from "../utils/textMeasure";
  import AxisSwitcher from "./AxisSwitcher.svelte";
  import Canvas from "./Canvas.svelte";
  import DimensionDialog from "./DimensionDialog.svelte";
  import GroupColorPopover from "./GroupColorPopover.svelte";
  import NodeCard from "./NodeCard.svelte";
  import NodeGroup from "./NodeGroup.svelte";
  import SpectrumOverlay from "./SpectrumOverlay.svelte";
  import SVGLayer from "./SVGLayer.svelte";

  interface Props {
    app: App;
    plugin: DimGraphPlugin;
    project: ProjectStore;
    parentComponent: Component;
    leaf: WorkspaceLeaf;
  }

  const { app, plugin, project, parentComponent, leaf }: Props = $props();

  /**
   * Stable empty lists.
   *
   * A new list changes the property identity on each render.
   */
  const EMPTY_WIDTHS: number[] = [];
  const EMPTY_TAGS: string[] = [];

  const ui = createUiStore();
  let fonts: FontConfig = $state(DEFAULT_FONTS);
  let canvasAreaEl: HTMLDivElement | undefined = $state();
  let canvasRef: Canvas | undefined = $state();

  /** The zoom value at which cards switch to the compact detail. */
  const COMPACT_ZOOM = 0.55;

  // The window size is an initial guess. Canvas reports the true size on mount.
  let viewport = $state<Viewport>({
    panX: 0,
    panY: 0,
    zoom: 1,
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    height: typeof window === "undefined" ? 0 : window.innerHeight,
  });

  /**
   * Store the canvas view after a pan, zoom, or resize.
   *
   * The function ignores a report with the same values. Each report makes an
   * object, and a new object causes an extra render.
   *
   * @param next - The new canvas view.
   */
  function handleViewport(next: Viewport) {
    const current = viewport;
    if (
      current.panX === next.panX &&
      current.panY === next.panY &&
      current.zoom === next.zoom &&
      current.width === next.width &&
      current.height === next.height
    ) {
      return;
    }
    viewport = next;
  }

  let dialogMode = $state<"create" | "edit" | null>(null);

  // --- Measured DOM heights for accurate layout ---
  let measuredHeights = $state<Record<string, number>>({});
  const pendingHeights = new Map<string, number>();
  let measureFrame = 0;

  /**
   * Store the measured height of a card.
   *
   * The function collects the heights and applies them in one animation frame.
   * One update prevents a full re-render for each card.
   *
   * @param id - The note identifier.
   * @param h - The measured card height in pixels.
   */
  function handleNodeMeasured(id: string, h: number) {
    pendingHeights.set(id, h);
    if (measureFrame) return;
    measureFrame = requestAnimationFrame(() => {
      measureFrame = 0;
      for (const [noteId, height] of pendingHeights) {
        if (measuredHeights[noteId] !== height) measuredHeights[noteId] = height;
      }
      pendingHeights.clear();
    });
  }

  onDestroy(() => {
    if (measureFrame) cancelAnimationFrame(measureFrame);
  });

  $effect(() => {
    if (ui.selectedNodeIds.size > 0) selectedBoxKeys = new Set();
  });

  // A chain highlight belongs to one dimension. A dimension switch clears it.
  $effect(() => {
    ui.activeDimensionId;
    ui.clearChainHighlight();
    selectedBoxKeys = new Set();
  });

  $effect(() => {
    ui.reconcile(Object.keys(project.project.dimensions));
  });

  const layout = $derived(
    layoutEngine(project.project, ui.activeDimensionId, {
      fonts,
      measuredHeights,
      hideUngrouped: ui.hideUngrouped,
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

  /** Return the named group under a point, or null for empty space. */
  function namedGroupAtPoint(wx: number, wy: number): string | null {
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
        project.moveNoteToGroup(
          id,
          ui.activeDimensionId,
          hitGroup,
          findNearestXStop(worldX),
          findNearestYStop(worldY),
        );
      }
      ui.selectNode(id, false);
    } else {
      const groupId = generateId("grp");
      project.addGroup(ui.activeDimensionId, groupId, "New Group");

      if (hasSpectra) {
        const xStop = findNearestXStop(worldX);
        const yStop = findNearestYStop(worldY);
        project.setGroupCells(ui.activeDimensionId, groupId, [
          { x: xStop, y: yStop },
        ]);
      }

      ui.selectGroup(groupId, false);
      selectedBoxKeys = new Set();
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
    ui.clearChainHighlight();
    ui.clearSelection();
    selectedBoxKeys = new Set();
    ui.editingShortId = null;
  }

  // --- Group selection ---

  /**
   * Select one group box, or toggle it in the selection.
   *
   * @param box - The clicked box.
   * @param e - The click event. Shift, Ctrl, or Cmd adds to the selection.
   */
  function handleGroupSelect(box: GroupBoxLike, e: MouseEvent) {
    if (box.groupId === "__ungrouped") return;
    ui.clearPendingDelete();
    const key = boxKey(box);
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      const next = new Set(selectedBoxKeys);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      selectedBoxKeys = next;
    } else {
      selectedBoxKeys = new Set([key]);
    }
  }

  /** Open the group color popover under the clicked color dot. */
  function handleGroupColorClick(box: GroupBoxLike, e: MouseEvent) {
    const dimId = ui.activeDimensionId;
    const dim = dimId ? project.project.dimensions[dimId] : null;
    const group = dim?.groups.find((item) => item.id === box.groupId);
    if (!group) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    colorPopover = {
      groupId: box.groupId,
      x: Math.round(rect.left),
      y: Math.round(rect.bottom + 6),
      current: group.color,
    };
  }

  // --- Group dragging state ---
  let draggingGroupId = $state<string | null>(null);
  let groupDragGhostX = $state(0);
  let groupDragGhostY = $state(0);
  let groupDragStartX = $state(0);
  let groupDragStartY = $state(0);
  let groupDragTracking = false;
  let groupDragTrackingId: string | null = null;
  let groupDragMode = $state<"move" | "proxy" | "resize" | "order">("move");
  let groupDragRun = $state<GroupRun | null>(null);
  let groupReorderOrder = $state<Record<
    string,
    Record<string, number>
  > | null>(null);
  let groupDragAnchorXStop = $state<string | null>(null);
  let groupDragAnchorYStop = $state<string | null>(null);
  let groupMoveTargetXStop = $state<string | null>(null);
  let groupMoveTargetYStop = $state<string | null>(null);
  let groupResizeAxis = $state<"x" | "y" | null>(null);
  let groupResizeEdge = $state<"min" | "max" | null>(null);
  let groupResizeTargetStop = $state<string | null>(null);
  let selectedBoxKeys = $state<Set<string>>(new Set());
  let colorPopover = $state<{
    groupId: string;
    x: number;
    y: number;
    current?: string;
  } | null>(null);
  let nodeDropGroupId = $state<string | null>(null);
  let nodeDropXStop = $state<string | null>(null);
  let nodeDropYStop = $state<string | null>(null);
  const GROUP_DRAG_THRESHOLD = 5;

  function handlePointerMove(e: PointerEvent) {
    if (!canvasRef) return;
    // A drag can lose its pointer when the release happens outside the window.
    // The next move then has no button held, so clear the stale drag here.
    if (e.buttons === 0) cancelPointerInteraction();
    const world = canvasRef.clientToWorld(e.clientX, e.clientY);
    ui.updateCursor(world.x, world.y);

    if (ui.isDraggingNode) {
      ui.updateDrag(world.x, world.y);
      const target = namedGroupAtPoint(world.x, world.y);
      if (target) {
        nodeDropGroupId = target;
        nodeDropXStop = findNearestXStop(world.x);
        nodeDropYStop = findNearestYStop(world.y);
      }
    }

    if (groupDragTracking && !draggingGroupId) {
      const dx = e.clientX - groupDragStartX;
      const dy = e.clientY - groupDragStartY;
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

      if (groupDragMode === "resize" && groupResizeAxis) {
        groupResizeTargetStop =
          groupResizeAxis === "x"
            ? findNearestXStop(world.x)
            : findNearestYStop(world.y);
      }

      // A drag that stays in the same cell reorders the box in its row.
      if (groupDragMode === "move" || groupDragMode === "order") {
        const run = groupDragRun;
        const sameCell =
          !!run &&
          run.yFrom === run.yTo &&
          groupMoveTargetXStop === groupDragAnchorXStop &&
          groupMoveTargetYStop === groupDragAnchorYStop;
        if (sameCell) {
          groupDragMode = "order";
          groupReorderOrder = computeReorderOrder(world.y);
        } else {
          groupDragMode = "move";
          groupReorderOrder = null;
        }
      }
    }
  }

  interface GroupBoxLike {
    groupId: string;
    xFrom: number;
    xTo: number;
    yFrom: number;
    yTo: number;
  }

  /** Return the stable key of a box. */
  function boxKey(box: GroupBoxLike): string {
    return `${box.groupId}:${box.xFrom},${box.yFrom}`;
  }

  /** Rebuild the run that a box covers. */
  function runFromBox(box: GroupBoxLike): GroupRun {
    const cells: CellIndex[] = [];
    if (box.yFrom === box.yTo) {
      for (let x = box.xFrom; x <= box.xTo; x++) {
        cells.push({ xi: x, yi: box.yFrom });
      }
    } else {
      for (let y = box.yFrom; y <= box.yTo; y++) {
        cells.push({ xi: box.xFrom, yi: y });
      }
    }
    return {
      xFrom: box.xFrom,
      xTo: box.xTo,
      yFrom: box.yFrom,
      yTo: box.yTo,
      cells,
    };
  }

  /**
   * Return the box order that the current reorder drag would produce.
   *
   * The function reads the current layout, moves the dragged box to the slot
   * that the pointer is over, and gives every box in the row a rank.
   *
   * @param pointerY - The pointer position on the world Y axis.
   * @returns A box order for each affected group, or null.
   */
  function computeReorderOrder(
    pointerY: number,
  ): Record<string, Record<string, number>> | null {
    const run = groupDragRun;
    const groupId = draggingGroupId;
    if (!run || !groupId || run.yFrom !== run.yTo) return null;
    const row = run.yFrom;
    const boxes = layout.groupBoxes
      .filter(
        (box) =>
          box.groupId !== "__ungrouped" &&
          box.yFrom === row &&
          box.yTo === row,
      )
      .map((box) => ({ key: boxKey(box), center: box.y + box.height / 2 }))
      .sort((a, b) => a.center - b.center);
    const draggedKey = `${groupId}:${run.xFrom},${run.yFrom}`;
    const dragged = boxes.find((box) => box.key === draggedKey);
    if (!dragged) return null;

    const others = boxes.filter((box) => box.key !== draggedKey);
    const target = others.filter((box) => box.center < pointerY).length;
    const sequence = [...others];
    sequence.splice(target, 0, dragged);

    const order: Record<string, Record<string, number>> = {};
    sequence.forEach((box, index) => {
      const [id, position] = box.key.split(":");
      const map = order[id] ?? {};
      map[position] = index;
      order[id] = map;
    });
    return order;
  }

  /**
   * Open the context menu for a group box.
   *
   * The menu acts on every selected box.
   *
   * @param box - The box that the pointer is over.
   * @param e - The context menu event.
   */
  function handleGroupContextMenu(box: GroupBoxLike, e: MouseEvent) {
    if (box.groupId === "__ungrouped") return;
    const dimId = ui.activeDimensionId;
    if (!dimId) return;
    e.preventDefault();
    e.stopPropagation();
    const key = boxKey(box);
    if (!selectedBoxKeys.has(key)) selectedBoxKeys = new Set([key]);

    const dim = project.project.dimensions[dimId];
    if (!dim) return;
    const positionsByGroup = new Map<string, Set<string>>();
    for (const selected of selectedBoxKeys) {
      const [groupId, position] = selected.split(":");
      const positions = positionsByGroup.get(groupId) ?? new Set<string>();
      positions.add(position);
      positionsByGroup.set(groupId, positions);
    }
    const entries = [...positionsByGroup].map(([groupId, positions]) => {
      const group = dim.groups.find((g) => g.id === groupId);
      const remaining = { ...group?.boxOrder };
      for (const position of positions) delete remaining[position];
      return {
        groupId,
        boxOrder: Object.keys(remaining).length ? remaining : null,
      };
    });

    const menu = new Menu();
    menu.addItem((item) =>
      item
        .setTitle("Autosort")
        .setIcon("arrow-up-down")
        .onClick(() => {
          project.setGroupBoxOrders(dimId, entries);
        }),
    );
    menu.showAtMouseEvent(e);
  }

  function handleGroupPointerDown(box: GroupBoxLike, e: PointerEvent) {
    if (e.button !== 0 || !hasSpectra || box.groupId === "__ungrouped") return;
    const world = canvasRef?.clientToWorld(e.clientX, e.clientY) ?? {
      x: ui.cursorWorldX,
      y: ui.cursorWorldY,
    };
    groupDragTracking = true;
    groupDragTrackingId = box.groupId;
    groupDragStartX = e.clientX;
    groupDragStartY = e.clientY;
    groupDragAnchorXStop = findNearestXStop(world.x);
    groupDragAnchorYStop = findNearestYStop(world.y);
    groupDragMode = e.shiftKey ? "proxy" : "move";
    groupDragRun = runFromBox(box);
  }

  /**
   * Start a knob drag that resizes one box.
   *
   * @param box - The box of the knob.
   * @param axis - The spectrum axis of the knob.
   * @param edge - The dragged edge of the run.
   * @param e - The pointer event.
   */
  function handleGroupResizeStart(
    box: GroupBoxLike,
    axis: "x" | "y",
    edge: "min" | "max",
    e: PointerEvent,
  ) {
    if (e.button !== 0 || !hasSpectra || box.groupId === "__ungrouped") return;
    const world = canvasRef?.clientToWorld(e.clientX, e.clientY) ?? {
      x: ui.cursorWorldX,
      y: ui.cursorWorldY,
    };
    draggingGroupId = box.groupId;
    groupDragTracking = false;
    groupDragMode = "resize";
    groupDragRun = runFromBox(box);
    groupResizeAxis = axis;
    groupResizeEdge = edge;
    groupResizeTargetStop =
      axis === "x" ? findNearestXStop(world.x) : findNearestYStop(world.y);
    groupDragStartX = e.clientX;
    groupDragStartY = e.clientY;
    selectedBoxKeys = new Set([boxKey(box)]);
  }

  /** Compute the group cells that the current drag would produce. */
  function computePendingCells(): GroupCell[] | null {
    if (!draggingGroupId) return null;
    if (groupDragMode === "order") return null;
    const dimId = ui.activeDimensionId;
    if (!dimId) return null;
    const dim = project.project.dimensions[dimId];
    const group = dim?.groups.find((g) => g.id === draggingGroupId);
    if (!dim || !group) return null;
    const xStops = dim["x-spectrum"]?.stops ?? null;
    const yStops = dim["y-spectrum"]?.stops ?? null;
    const indices = cellsToIndices(group.cells, xStops, yStops);

    if (groupDragMode === "resize") {
      const run = groupDragRun;
      const axis = groupResizeAxis;
      const edge = groupResizeEdge;
      const target = groupResizeTargetStop;
      if (!run || !axis || !edge || !target) return null;
      const stops = axis === "x" ? xStops : yStops;
      if (!stops) return null;
      const targetIndex = stops.indexOf(target);
      if (targetIndex < 0) return null;
      return indicesToCells(
        resizeRunCells(indices, run, axis, edge, targetIndex),
        xStops,
        yStops,
      );
    }

    if (groupDragMode === "proxy") {
      const xCount = xStops ? xStops.length : 1;
      const yCount = yStops ? yStops.length : 1;
      const xi = xStops ? xStops.indexOf(groupMoveTargetXStop ?? "") : 0;
      const yi = yStops ? yStops.indexOf(groupMoveTargetYStop ?? "") : 0;
      if (xStops && (xi < 0 || xi >= xCount)) return null;
      if (yStops && (yi < 0 || yi >= yCount)) return null;
      const next = addCellIndex(indices, xi, yi);
      if (next.length === indices.length) return null;
      return indicesToCells(next, xStops, yStops);
    }

    const run = groupDragRun;
    if (!run) return null;
    const xCount = xStops ? xStops.length : 1;
    const yCount = yStops ? yStops.length : 1;
    let dx = 0;
    let dy = 0;
    if (xStops && groupDragAnchorXStop && groupMoveTargetXStop) {
      const from = xStops.indexOf(groupDragAnchorXStop);
      const to = xStops.indexOf(groupMoveTargetXStop);
      if (from >= 0 && to >= 0) dx = to - from;
    }
    if (yStops && groupDragAnchorYStop && groupMoveTargetYStop) {
      const from = yStops.indexOf(groupDragAnchorYStop);
      const to = yStops.indexOf(groupMoveTargetYStop);
      if (from >= 0 && to >= 0) dy = to - from;
    }
    if (dx === 0 && dy === 0) return null;
    return indicesToCells(
      shiftRunCells(indices, run, dx, dy, xCount, yCount),
      xStops,
      yStops,
    );
  }

  const pendingCells = $derived.by(computePendingCells);

  /** Apply a finished group drag. */
  function commitGroupDrag() {
    const dimId = ui.activeDimensionId;
    const cells = computePendingCells();
    if (!dimId || !draggingGroupId || !cells) return;
    project.setGroupCells(dimId, draggingGroupId, cells);
  }

  /**
   * Remove every selected box.
   *
   * The function drops the group when a selected box is its last box.
   */
  function removeSelectedBoxes() {
    const dimId = ui.activeDimensionId;
    if (!dimId || selectedBoxKeys.size === 0) return;
    const dim = project.project.dimensions[dimId];
    if (!dim) return;
    const xStops = dim["x-spectrum"]?.stops ?? null;
    const yStops = dim["y-spectrum"]?.stops ?? null;

    for (const key of [...selectedBoxKeys]) {
      const [groupId, pos] = key.split(":");
      const [xf, yf] = pos.split(",").map(Number);
      const group = dim.groups.find((g) => g.id === groupId);
      if (!group) continue;
      const indices = cellsToIndices(group.cells, xStops, yStops);
      const run = decomposeGroupRuns(indices).find(
        (item) => item.xFrom === xf && item.yFrom === yf,
      );
      if (!run) continue;
      const runKeys = new Set(run.cells.map((cell) => `${cell.xi},${cell.yi}`));
      const remaining = indices.filter(
        (cell) => !runKeys.has(`${cell.xi},${cell.yi}`),
      );
      if (remaining.length === 0) {
        project.removeGroup(dimId, groupId);
      } else {
        project.setGroupCells(
          dimId,
          groupId,
          indicesToCells(remaining, xStops, yStops),
        );
      }
    }
    selectedBoxKeys = new Set();
    ui.clearSelection();
  }

  /**
   * Clear a pointer drag that lost its button.
   *
   * The function runs when the pointer returns without a held button, or when
   * the window loses focus. It ends the drag without a move.
   */
  function cancelPointerInteraction() {
    if (ui.isDraggingNode) {
      ui.endDrag();
      nodeDropGroupId = null;
      nodeDropXStop = null;
      nodeDropYStop = null;
    }
    if (draggingGroupId || groupDragTracking) {
      draggingGroupId = null;
      groupDragTracking = false;
      groupDragTrackingId = null;
      groupDragRun = null;
      groupDragMode = "move";
      groupReorderOrder = null;
      groupMoveTargetXStop = null;
      groupMoveTargetYStop = null;
      groupResizeAxis = null;
      groupResizeEdge = null;
      groupResizeTargetStop = null;
    }
  }

  $effect(() => {
    const cancel = () => cancelPointerInteraction();
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", cancel);
    return () => {
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", cancel);
    };
  });

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
      nodeDropGroupId = null;
      nodeDropXStop = null;
      nodeDropYStop = null;
    }

    if (draggingGroupId && ui.activeDimensionId && hasSpectra) {
      if (groupDragMode === "order" && groupReorderOrder) {
        project.setGroupBoxOrders(
          ui.activeDimensionId,
          Object.entries(groupReorderOrder).map(([groupId, boxOrder]) => ({
            groupId,
            boxOrder,
          })),
        );
      } else {
        commitGroupDrag();
      }
    }

    draggingGroupId = null;
    groupDragTracking = false;
    groupDragTrackingId = null;
    groupDragRun = null;
    groupDragMode = "move";
    groupReorderOrder = null;
    groupMoveTargetXStop = null;
    groupMoveTargetYStop = null;
    groupResizeAxis = null;
    groupResizeEdge = null;
    groupResizeTargetStop = null;
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

  // --- Clipboard ---

  /**
   * Copy the data of the given notes for the clipboard.
   *
   * @param ids - The note IDs to copy.
   * @returns A clipboard entry for each known note.
   */
  function snapshotNotes(ids: string[]): ClipboardNote[] {
    const entries: ClipboardNote[] = [];
    for (const id of ids) {
      const note = project.project.notes[id];
      if (!note) continue;
      entries.push({
        id,
        title: note.title,
        short: note.short,
        long: note.long,
        width: note.width,
        tags: note.tags ? [...note.tags] : undefined,
        connections: Object.fromEntries(
          Object.entries(note.connections ?? {}).map(([dimId, list]) => [
            dimId,
            list.map((conn) => ({ to: conn.to, label: conn.label })),
          ]),
        ),
      });
    }
    return entries;
  }

  // --- Keyboard shortcuts ---

  /**
   * Return true when this Viewpoint view is the active leaf.
   *
   * The window key listener stays active in an inactive tab.
   * Without this test, Ctrl+X removes the selected notes in the background.
   *
   * @returns True when the workspace focus is in this view.
   */
  function isActiveView(): boolean {
    return app.workspace.activeLeaf === leaf;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isActiveView()) return;
    if (dialogMode) return;

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

    // Tab cycles dimensions on the canvas. In an input field, Tab must move
    // the focus instead.
    if (e.key === "Tab" && !e.altKey && !e.shiftKey) {
      const dimIds = Object.keys(project.project.dimensions);
      if (!dimIds.length) return;
      e.preventDefault();
      ui.cycle(dimIds, e.ctrlKey ? -1 : 1);
      return;
    }

    if (e.key === "Escape") {
      if (draggingGroupId) {
        draggingGroupId = null;
        groupDragTracking = false;
        groupDragRun = null;
        groupDragMode = "move";
        groupReorderOrder = null;
        groupMoveTargetXStop = null;
        groupMoveTargetYStop = null;
        groupResizeAxis = null;
        groupResizeEdge = null;
        groupResizeTargetStop = null;
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
      } else if (ui.hasChainHighlight) {
        ui.clearChainHighlight();
      } else if (ui.editingShortId || ui.editingLongId) {
        ui.editingShortId = null;
        ui.editingLongId = null;
      } else if (selectedBoxKeys.size > 0) {
        selectedBoxKeys = new Set();
      } else if (ui.hasSelection) {
        ui.clearSelection();
      } else {
        ui.clearFocus();
      }
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      if (
        ui.selectedNodeIds.size === 0 &&
        selectedBoxKeys.size > 0 &&
        ui.activeDimensionId
      ) {
        e.preventDefault();
        removeSelectedBoxes();
        return;
      }
      if (ui.hasSelection) {
        e.preventDefault();
        if (ui.selectedNodeIds.size > 0) {
          project.removeNotes([...ui.selectedNodeIds]);
        }
        if (ui.activeDimensionId && ui.selectedGroupIds.size > 0) {
          project.removeGroups(ui.activeDimensionId, [...ui.selectedGroupIds]);
        }
        ui.clearSelection();
        selectedBoxKeys = new Set();
      }
      return;
    }

    if (e.key === "c" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      if (ui.selectedNodeIds.size > 0) {
        ui.copyNodes(snapshotNotes([...ui.selectedNodeIds]));
      }
      return;
    }

    if (e.key === "x" && (e.ctrlKey || e.metaKey)) {
      if (ui.selectedNodeIds.size > 0) {
        e.preventDefault();
        const ids = [...ui.selectedNodeIds];
        ui.cutNodes(snapshotNotes(ids));
        for (const id of ids) {
          project.removeNote(id);
        }
        ui.clearSelection();
      }
      return;
    }

    if (e.key === "v" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      if (ui.clipboardNotes.length === 0) return;
      e.preventDefault();
      const dimId = ui.activeDimensionId;
      const groupId = dimId
        ? namedGroupAtPoint(ui.cursorWorldX, ui.cursorWorldY)
        : null;
      const newIds = project.pasteNotes(
        ui.clipboardNotes,
        dimId,
        groupId,
        findNearestXStop(ui.cursorWorldX),
        findNearestYStop(ui.cursorWorldY),
      );
      ui.clearSelection();
      for (const id of newIds) ui.selectNode(id, true);
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

  /** Build a preview project with one note moved to a target group and cell. */
  function applyNodeDrop(
    base: ProjectData,
    dimId: string,
    noteId: string,
    groupId: string | null,
    xStop: string | null,
    yStop: string | null,
  ): ProjectData {
    const note = base.notes[noteId];
    if (!note) return base;
    const copy: Note = {
      ...note,
      membership: { ...note.membership },
      placement: note.placement ? { ...note.placement } : undefined,
    };
    const dim = base.dimensions[dimId];
    const group = groupId
      ? dim?.groups.find((item) => item.id === groupId)
      : undefined;
    if (dim && group) {
      placeNoteInGroup(
        copy,
        dimId,
        group.cells,
        xStop,
        yStop,
        dim["x-spectrum"]?.stops ?? null,
        dim["y-spectrum"]?.stops ?? null,
      );
    } else {
      clearNotePlacement(copy, dimId);
    }
    copy.membership[dimId] = group ? group.id : null;
    return { ...base, notes: { ...base.notes, [noteId]: copy } };
  }

  /** Layout of the project after the current drag, or null. */
  const previewLayout = $derived.by(() => {
    const dimId = ui.activeDimensionId;
    if (!dimId) return null;

    if (groupDragMode === "order" && draggingGroupId && groupReorderOrder) {
      const dim = project.project.dimensions[dimId];
      if (!dim) return null;
      const reorder = groupReorderOrder;
      const previewProject: ProjectData = {
        ...project.project,
        dimensions: {
          ...project.project.dimensions,
          [dimId]: {
            ...dim,
            groups: dim.groups.map((g) =>
              reorder[g.id]
                ? {
                    ...g,
                    boxOrder: { ...g.boxOrder, ...reorder[g.id] },
                  }
                : g,
            ),
          },
        },
      };
      return layoutEngine(previewProject, dimId, {
        fonts,
        measuredHeights,
        hideUngrouped: ui.hideUngrouped,
      });
    }

    if (ui.isDraggingNode && ui.draggingNodeId && nodeDropGroupId) {
      const previewProject = applyNodeDrop(
        project.project,
        dimId,
        ui.draggingNodeId,
        nodeDropGroupId,
        nodeDropXStop,
        nodeDropYStop,
      );
      return layoutEngine(previewProject, dimId, {
        fonts,
        measuredHeights,
        hideUngrouped: ui.hideUngrouped,
      });
    }

    const cells = pendingCells;
    if (!cells || !draggingGroupId) return null;
    const dim = project.project.dimensions[dimId];
    if (!dim) return null;
    const previewProject: ProjectData = {
      ...project.project,
      dimensions: {
        ...project.project.dimensions,
        [dimId]: {
          ...dim,
          groups: dim.groups.map((g) =>
            g.id === draggingGroupId ? { ...g, cells } : g,
          ),
        },
      },
    };
    return layoutEngine(previewProject, dimId, {
      fonts,
      measuredHeights,
      hideUngrouped: ui.hideUngrouped,
    });
  });

  /** The layout to show: the drag preview while dragging, else the real one. */
  const shownLayout = $derived(previewLayout ?? layout);

  /** The world rectangle that the viewport shows, or null before the size. */
  const viewRect = $derived(viewportRect(viewport, 0.5));

  /**
   * True when a card shows only its title and a placeholder.
   *
   * The compact detail keeps a far view cheap. It also applies before the
   * first viewport report, so the file opens fast.
   */
  const compact = $derived(!viewRect || viewport.zoom < COMPACT_ZOOM);

  /** The cards that touch the viewport, or all cards before the size. */
  const visibleNodes = $derived.by(() => {
    const entries = Object.entries(shownLayout.nodes);
    const rect = viewRect;
    if (!rect) return entries;
    return entries.filter(([, node]) =>
      rectsIntersect(rect, node.x, node.y, node.width, node.height),
    );
  });

  /** The group boxes that touch the viewport, or all boxes before the size. */
  const visibleGroupBoxes = $derived.by(() => {
    const rect = viewRect;
    if (!rect) return shownLayout.groupBoxes;
    return shownLayout.groupBoxes.filter((box) =>
      rectsIntersect(rect, box.x, box.y, box.width, box.height),
    );
  });

  /**
   * Group the card widths by column and by note.
   *
   * The width snap uses the widths of the other cards in the same column. A
   * precomputed map removes a scan of all cards for each card.
   */
  const columnWidthsByNote = $derived.by(() => {
    const byColumn = new Map<number, { id: string; width: number }[]>();
    for (const nodeId in shownLayout.nodes) {
      const node = shownLayout.nodes[nodeId];
      const column = Math.round(node.x);
      const list = byColumn.get(column);
      if (list) list.push({ id: nodeId, width: node.width });
      else byColumn.set(column, [{ id: nodeId, width: node.width }]);
    }
    const result: Record<string, number[]> = {};
    for (const list of byColumn.values()) {
      for (const item of list) {
        result[item.id] = list
          .filter((other) => other.id !== item.id)
          .map((other) => other.width);
      }
    }
    return result;
  });

  const groupDragHint = $derived.by(() => {
    if (!draggingGroupId) return null;
    if (groupDragMode === "resize") {
      return groupResizeTargetStop
        ? `Resize to ${groupResizeTargetStop}`
        : "Drag a knob to span stops";
    }
    if (groupDragMode === "order") {
      return "Drag to reorder in the row";
    }
    if (groupDragMode === "proxy") {
      const parts: string[] = [];
      if (groupMoveTargetXStop) parts.push(`X: ${groupMoveTargetXStop}`);
      if (groupMoveTargetYStop) parts.push(`Y: ${groupMoveTargetYStop}`);
      return parts.length
        ? `Place a copy at ${parts.join(" ")}`
        : "Shift-drag to place a copy";
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
</script>

<svelte:window
  onkeydown={handleKeydown}
  onpointerup={handlePointerUp}
  onpointercancel={() => cancelPointerInteraction()}
/>

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
      onViewport={handleViewport}
    >
      <SpectrumOverlay
        xSpectrum={layout.xSpectrum}
        ySpectrum={layout.ySpectrum}
        dimmed={ui.isDraggingNode}
      />

      {#each visibleGroupBoxes as box (box.groupId + ":" + box.xFrom + ":" + box.yFrom)}
        <NodeGroup
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          name={box.name}
          color={box.color}
          preview={!!previewLayout}
          emphasis={ui.isDraggingNode}
          highlight={nodeDropGroupId === box.groupId}
          chainDim={ui.hasChainHighlight &&
            !box.memberIds.some((id) => ui.chainNodeIds.has(id))}
          selected={selectedBoxKeys.has(boxKey(box))}
          draggable={hasSpectra &&
            box.groupId !== "__ungrouped" &&
            selectedBoxKeys.has(boxKey(box))}
          beingDragged={draggingGroupId === box.groupId}
          resizableX={!previewLayout &&
            hasSpectra &&
            !!activeDim?.["x-spectrum"] &&
            box.groupId !== "__ungrouped" &&
            box.yFrom === box.yTo}
          resizableY={!previewLayout &&
            hasSpectra &&
            !!activeDim?.["y-spectrum"] &&
            box.groupId !== "__ungrouped" &&
            box.xFrom === box.xTo}
          onSelect={(e) => handleGroupSelect(box, e)}
          onContextMenu={(e) => handleGroupContextMenu(box, e)}
          onRename={ui.activeDimensionId
            ? (newName) => handleGroupRename(box.groupId, newName)
            : undefined}
          onDragStart={(e) => handleGroupPointerDown(box, e)}
          onColorClick={(e) => handleGroupColorClick(box, e)}
          onResizeStart={(axis, edge, e) =>
            handleGroupResizeStart(box, axis, edge, e)}
        />
      {/each}

      <SVGLayer {project} {ui} layout={shownLayout} {viewRect} />

      {#each visibleNodes as [noteId, pos] (noteId)}
        <NodeCard
          width={pos.width}
          columnWidths={columnWidthsByNote[noteId] ?? EMPTY_WIDTHS}
          height={pos.height}
          x={pos.x}
          y={pos.y}
          preview={!!previewLayout}
          detail={compact ? "compact" : "full"}
          {app}
          {noteId}
          title={project.project.notes[noteId].title}
          short={project.project.notes[noteId].short}
          long={project.project.notes[noteId].long}
          tags={project.project.notes[noteId].tags ?? EMPTY_TAGS}
          suggestions={tagSuggestions}
          {parentComponent}
          {ui}
          {project}
          onMeasured={handleNodeMeasured}
        />
      {/each}

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

{#if colorPopover}
  <GroupColorPopover
    x={colorPopover.x}
    y={colorPopover.y}
    current={colorPopover.current}
    onPick={(color) => {
      if (ui.activeDimensionId) {
        project.setGroupColor(
          ui.activeDimensionId,
          colorPopover!.groupId,
          color,
        );
      }
    }}
    onClose={() => (colorPopover = null)}
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
