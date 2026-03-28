<!-- src/components/SVGLayer.svelte -->
<script lang="ts">
  import { fade } from "svelte/transition";
  import type { ProjectStore } from "../stores/project.svelte";
  import type { UiStore } from "../stores/ui.svelte";
  import type { LayoutResult, NodeLayout } from "../utils/layout";

  interface Props {
    project: ProjectStore;
    ui: UiStore;
    layout: LayoutResult;
  }

  const { project, ui, layout }: Props = $props();

  // --- Label editing state ---
  let editingFrom = $state<string | null>(null);
  let editingTo = $state<string | null>(null);
  let editValue = $state("");
  let editX = $state(0);
  let editY = $state(0);
  let editInputEl: HTMLInputElement | undefined = $state();

  // --- Dimension-change crossfade ---
  let layerOpacity = $state(1);
  let prevDimId = $state<string | null>(null);

  $effect(() => {
    const currentDim = ui.activeDimensionId;
    if (prevDimId !== null && currentDim !== prevDimId) {
      layerOpacity = 0;
      setTimeout(() => {
        layerOpacity = 1;
      }, 160);
    }
    prevDimId = currentDim;
  });

  // --- Drag-to-retarget state (local, before committing to ui store) ---
  let dragEdge: Edge | null = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragHalf: "source" | "target" = "target";
  let dragActive = false;
  const DRAG_THRESHOLD = 6;

  // --- Derive edges ---

  interface Edge {
    key: string;
    index: number;
    path: string;
    labelX: number;
    labelY: number;
    label: string | null;
    from: string;
    to: string;
    // Store control points for t-parameter computation
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    cp1x: number;
    cp1y: number;
    cp2x: number;
    cp2y: number;
  }

  const dimId = $derived(ui.activeDimensionId);

  const edges: Edge[] = $derived.by(() => {
    if (!dimId) return [];
    const conns = project.getConnections(dimId); // ← changed
    const result: Edge[] = [];
    const occurrences = new Map<string, number>();

    for (let i = 0; i < conns.length; i++) {
      const conn = conns[i];
      const fromNode = layout.nodes[conn.from];
      const toNode = layout.nodes[conn.to];
      if (!fromNode || !toNode) continue;

      const pairKey = `${conn.from}:${conn.to}`;
      const occ = occurrences.get(pairKey) ?? 0;
      occurrences.set(pairKey, occ + 1);

      const edge = buildEdge(
        `${dimId}:${pairKey}:${occ}`,
        i, // still used internally for UI only
        conn.from,
        conn.to,
        conn.label,
        fromNode,
        toNode,
      );
      if (edge) result.push(edge);
    }
    return result;
  });

  // --- Ghost line ---
  const ghostLine = $derived.by(() => {
    const sourceId = ui.ghostSourceId;
    if (!sourceId) return null;
    const node = layout.nodes[sourceId];
    if (!node) return null;

    const x1 = node.x + node.width / 2;
    const y1 = node.y + node.height / 2;
    const x2 = ui.cursorWorldX;
    const y2 = ui.cursorWorldY;

    return { x1, y1, x2, y2 };
  });

  function isPendingDelete(edge: Edge): boolean {
    return !!dimId && ui.isPendingDelete(dimId, edge.index);
  }

  // Check if this edge is currently being retargeted (to hide it during drag)
  function isBeingRetargeted(edge: Edge): boolean {
    return (
      !!dimId && ui.retargetDimId === dimId && ui.retargetIndex === edge.index
    );
  }

  function buildEdge(
    key: string,
    index: number,
    fromId: string,
    toId: string,
    label: string | null,
    from: NodeLayout,
    to: NodeLayout,
  ): Edge | null {
    if (fromId === toId) {
      const rx = from.x + from.width;
      const cy = from.y + from.height / 2;
      const loopW = 40;
      const loopH = 24;
      const path = `M ${rx} ${cy - loopH / 2} C ${rx + loopW} ${cy - loopH}, ${rx + loopW} ${cy + loopH}, ${rx} ${cy + loopH / 2}`;
      return {
        key,
        index,
        path,
        labelX: rx + loopW + 4,
        labelY: cy,
        label,
        from: fromId,
        to: toId,
        x1: rx,
        y1: cy - loopH / 2,
        x2: rx,
        y2: cy + loopH / 2,
        cp1x: rx + loopW,
        cp1y: cy - loopH,
        cp2x: rx + loopW,
        cp2y: cy + loopH,
      };
    }

    const fromCx = from.x + from.width / 2;
    const toCx = to.x + to.width / 2;
    const sameColumn = Math.abs(fromCx - toCx) < from.width * 0.8;

    let x1: number, y1: number, x2: number, y2: number;
    let cp1x: number, cp1y: number, cp2x: number, cp2y: number;

    if (sameColumn) {
      x1 = from.x + from.width;
      y1 = from.y + from.height / 2;
      x2 = to.x + to.width;
      y2 = to.y + to.height / 2;
      const bulge = 60 + Math.abs(y2 - y1) * 0.15;
      cp1x = x1 + bulge;
      cp1y = y1;
      cp2x = x2 + bulge;
      cp2y = y2;
      const path = `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
      const lx = Math.max(x1, x2) + bulge * 0.55;
      const ly = (y1 + y2) / 2;
      return {
        key,
        index,
        path,
        labelX: lx,
        labelY: ly,
        label,
        from: fromId,
        to: toId,
        x1,
        y1,
        x2,
        y2,
        cp1x,
        cp1y,
        cp2x,
        cp2y,
      };
    }

    if (fromCx < toCx) {
      x1 = from.x + from.width;
      y1 = from.y + from.height / 2;
      x2 = to.x;
      y2 = to.y + to.height / 2;
    } else {
      x1 = from.x;
      y1 = from.y + from.height / 2;
      x2 = to.x + to.width;
      y2 = to.y + to.height / 2;
    }

    const dx = x2 - x1;
    const cpOff = Math.max(Math.abs(dx) * 0.45, 40);
    const sign = dx >= 0 ? 1 : -1;
    cp1x = x1 + cpOff * sign;
    cp1y = y1;
    cp2x = x2 - cpOff * sign;
    cp2y = y2;

    const path = `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
    const lx = bezierPoint(x1, cp1x, cp2x, x2, 0.5);
    const ly = bezierPoint(y1, cp1y, cp2y, y2, 0.5);

    return {
      key,
      index,
      path,
      labelX: lx,
      labelY: ly,
      label,
      from: fromId,
      to: toId,
      x1,
      y1,
      x2,
      y2,
      cp1x,
      cp1y,
      cp2x,
      cp2y,
    };
  }

  function bezierPoint(
    p0: number,
    p1: number,
    p2: number,
    p3: number,
    t: number,
  ): number {
    const mt = 1 - t;
    return (
      mt * mt * mt * p0 +
      3 * mt * mt * t * p1 +
      3 * mt * t * t * p2 +
      t * t * t * p3
    );
  }

  /** Find approximate t on the cubic bezier closest to (px, py). Returns 0..1. */
  function closestT(edge: Edge, px: number, py: number): number {
    let bestT = 0;
    let bestDist = Infinity;
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const bx = bezierPoint(edge.x1, edge.cp1x, edge.cp2x, edge.x2, t);
      const by = bezierPoint(edge.y1, edge.cp1y, edge.cp2y, edge.y2, t);
      const d = (bx - px) * (bx - px) + (by - py) * (by - py);
      if (d < bestDist) {
        bestDist = d;
        bestT = t;
      }
    }
    return bestT;
  }

  // --- Label editing ---

  function startEditing(edge: Edge) {
    editingFrom = edge.from;
    editingTo = edge.to;
    editValue = edge.label ?? "";
    editX = edge.labelX;
    editY = edge.labelY;
    requestAnimationFrame(() => {
      editInputEl?.focus();
      editInputEl?.select();
    });
  }

  function commitEdit() {
    if (!editingFrom || !editingTo || !dimId) return;
    const trimmed = editValue.trim();
    project.updateConnectionLabel(
      dimId,
      editingFrom,
      editingTo,
      trimmed || null,
    );
    editingFrom = null;
    editingTo = null;
  }

  function cancelEdit() {
    editingFrom = null;
    editingTo = null;
  }

  function onEditKeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  }

  // --- Edge interactions ---

  function handleEdgeContextMenu(e: MouseEvent, edge: Edge) {
    e.preventDefault();
    e.stopPropagation();
    if (!dimId) return;
    ui.markConnectionForDelete(dimId, edge.index);
  }

  function handleEdgeClick(e: MouseEvent, edge: Edge) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (!dimId) return;

    if (ui.isPendingDelete(dimId, edge.index)) {
      project.removeConnection(dimId, edge.from, edge.to);
      ui.clearPendingDelete();
      return;
    }

    ui.clearPendingDelete();
  }

  /** Pointerdown on the edge-hit area — start potential drag-to-retarget */
  function handleEdgePointerDown(e: PointerEvent, edge: Edge) {
    if (e.button !== 0) return;
    // Don't start drag if pending delete
    if (dimId && ui.isPendingDelete(dimId, edge.index)) return;
    // Don't retarget self-loops
    if (edge.from === edge.to) return;

    dragEdge = edge;
    dragStartX = ui.cursorWorldX;
    dragStartY = ui.cursorWorldY;
    dragActive = false;

    // Determine which half: find closest t to cursor
    const t = closestT(edge, ui.cursorWorldX, ui.cursorWorldY);
    dragHalf = t < 0.5 ? "source" : "target";

    // Listen globally for move/up
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragUp);
  }

  function onDragMove(e: PointerEvent) {
    if (!dragEdge || !dimId) return;

    const dx = ui.cursorWorldX - dragStartX;
    const dy = ui.cursorWorldY - dragStartY;

    if (!dragActive && dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) {
      dragActive = true;
      // Commit to retarget mode in ui store
      const edge = dragEdge;
      if (dragHalf === "target") {
        // Dragging target end: anchor=from, original=to
        ui.startRetarget(
          dimId,
          edge.index,
          "target",
          edge.from,
          edge.to,
          edge.label,
        );
      } else {
        // Dragging source end: anchor=to, original=from
        ui.startRetarget(
          dimId,
          edge.index,
          "source",
          edge.to,
          edge.from,
          edge.label,
        );
      }
    }
  }

  function onDragUp(_e: PointerEvent) {
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragUp);
    dragEdge = null;
    dragActive = false;
    // If retarget was activated but user released without dropping on a node,
    // it stays active — they can still click a node to complete.
    // (Or they press Escape / click empty space to cancel.)
  }
</script>

<svg
  class="svg-connections"
  style:opacity={layerOpacity}
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 1 1"
>
  <defs>
    <marker
      id="conn-arrow"
      viewBox="0 0 10 6"
      refX="9"
      refY="3"
      markerWidth="8"
      markerHeight="6"
      orient="auto"
    >
      <path d="M 0 0.5 L 9 3 L 0 5.5 Z" class="arrow-fill" />
    </marker>
    <marker
      id="conn-arrow-delete"
      viewBox="0 0 10 6"
      refX="9"
      refY="3"
      markerWidth="8"
      markerHeight="6"
      orient="auto"
    >
      <path d="M 0 0.5 L 9 3 L 0 5.5 Z" class="arrow-fill-delete" />
    </marker>
    <marker
      id="conn-arrow-ghost"
      viewBox="0 0 10 6"
      refX="9"
      refY="3"
      markerWidth="8"
      markerHeight="6"
      orient="auto"
    >
      <path d="M 0 0.5 L 9 3 L 0 5.5 Z" class="arrow-fill-ghost" />
    </marker>
  </defs>

  {#each edges as edge (edge.key)}
    {@const pendingDel = isPendingDelete(edge)}
    {@const retargeting = isBeingRetargeted(edge)}
    <g
      class="edge-group"
      class:pending-delete={pendingDel}
      class:retargeting
      in:fade={{ duration: 50, delay: 50 }}
      out:fade={{ duration: 50 }}
    >
      <path
        d={edge.path}
        class="edge-hit"
        onclick={(e) => handleEdgeClick(e, edge)}
        oncontextmenu={(e) => handleEdgeContextMenu(e, edge)}
        onpointerdown={(e) => handleEdgePointerDown(e, edge)}
        ondblclick={(e) => {
          e.stopPropagation();
          startEditing(edge);
        }}
      />
      <path
        d={edge.path}
        class="edge-line"
        class:edge-line-delete={pendingDel}
        marker-end={pendingDel ? "url(#conn-arrow-delete)" : "url(#conn-arrow)"}
      />
      {#if edge.label && (editingFrom !== edge.from || editingTo !== edge.to)}
        <g
          class="edge-label-group"
          ondblclick={(e) => {
            e.stopPropagation();
            startEditing(edge);
          }}
        >
          <rect
            x={edge.labelX - edge.label.length * 3.5 - 4}
            y={edge.labelY - 10}
            width={edge.label.length * 7 + 8}
            height={20}
            rx="4"
            class="label-bg"
          />
          <text
            x={edge.labelX}
            y={edge.labelY + 4}
            text-anchor="middle"
            class="label-text"
          >
            {edge.label}
          </text>
        </g>
      {/if}
    </g>
  {/each}

  <!-- Ghost connection line -->
  {#if ghostLine}
    <line
      x1={ghostLine.x1}
      y1={ghostLine.y1}
      x2={ghostLine.x2}
      y2={ghostLine.y2}
      class="ghost-line"
      marker-end="url(#conn-arrow-ghost)"
    />
  {/if}
</svg>

{#if editingFrom !== null && editingTo !== null}
  <div class="label-edit-overlay" style:left="{editX}px" style:top="{editY}px">
    <input
      bind:this={editInputEl}
      bind:value={editValue}
      class="label-edit-input"
      placeholder="Label…"
      onkeydown={onEditKeydown}
      onblur={commitEdit}
      onclick={(e) => e.stopPropagation()}
      ondblclick={(e) => e.stopPropagation()}
    />
  </div>
{/if}

<style>
  .svg-connections {
    position: absolute;
    top: 0;
    left: 0;
    width: 1px;
    height: 1px;
    overflow: visible;
    pointer-events: none;
    z-index: 1;
    transition: opacity 150ms ease;
  }

  .edge-group {
    pointer-events: auto;
  }

  /* Hide the edge being retargeted (ghost line replaces it) */
  .edge-group.retargeting {
    opacity: 0.2;
    pointer-events: none;
  }

  .edge-hit {
    fill: none;
    stroke: transparent;
    stroke-width: 14;
    cursor: grab;
  }

  .edge-line {
    fill: none;
    stroke: var(--text-faint);
    stroke-width: 1.5;
    pointer-events: none;
    transition:
      stroke 120ms ease,
      stroke-width 120ms ease;
  }

  .edge-line-delete {
    stroke: var(--color-red);
    stroke-width: 2.5;
  }

  .edge-group:hover .edge-line {
    stroke: var(--text-muted);
    stroke-width: 2;
  }

  .edge-group.pending-delete .edge-line {
    stroke: var(--color-red);
    stroke-width: 2.5;
  }

  .edge-group.pending-delete:hover .edge-line {
    stroke: var(--color-red);
    stroke-width: 3;
  }

  .edge-group.pending-delete .edge-hit {
    cursor: pointer;
  }

  .arrow-fill {
    fill: var(--text-faint);
  }

  .arrow-fill-delete {
    fill: var(--color-red);
  }

  .arrow-fill-ghost {
    fill: var(--color-green);
    opacity: 0.7;
  }

  .edge-group:hover .arrow-fill {
    fill: var(--text-muted);
  }

  .edge-label-group {
    cursor: pointer;
  }

  .label-bg {
    fill: var(--background-secondary);
    stroke: var(--background-modifier-border);
    stroke-width: 1;
  }

  .label-text {
    fill: var(--text-muted);
    font-size: 12px;
    font-family: var(--font-interface);
    pointer-events: none;
  }

  .label-edit-overlay {
    position: absolute;
    transform: translate(-50%, -50%);
    z-index: 5;
  }

  .label-edit-input {
    padding: 2px 8px;
    border: 1px solid var(--interactive-accent);
    border-radius: var(--radius-s);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 12px;
    font-family: var(--font-interface);
    width: 120px;
    text-align: center;
    outline: none;
  }

  .ghost-line {
    stroke: var(--color-green);
    stroke-width: 2;
    stroke-dasharray: 8 4;
    opacity: 0.7;
    pointer-events: none;
  }
</style>
