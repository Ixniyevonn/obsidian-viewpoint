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
    let editingBundleKey = $state<string | null>(null);
    let editValue = $state("");
    let editX = $state(0);
    let editY = $state(0);
    let editInputEl: HTMLInputElement | undefined = $state();
    /** Which direction's label we're editing inside a bundle */
    let editingDirection = $state<"forward" | "reverse">("forward");

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

    // --- Drag-to-retarget state ---
    let dragBundle: EdgeBundle | null = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragHalf: "source" | "target" = "target";
    let dragActive = false;
    const DRAG_THRESHOLD = 6;

    // --- Types ---

    interface RawEdge {
        index: number; // index in the flat connections array
        from: string;
        to: string;
        label: string | null;
    }

    /**
     * An EdgeBundle groups all connections between a pair of nodes (both directions).
     * - forwardCount: number of A→B connections
     * - reverseCount: number of B→A connections
     * - isBidirectional: reverseCount > 0
     * - strength: max(forwardCount, reverseCount) — drives stroke width
     * - nodeA / nodeB: canonical pair (nodeA < nodeB lexicographically)
     * - forwardFrom / forwardTo: actual direction of the "forward" edges
     */
    interface EdgeBundle {
        key: string;
        nodeA: string; // canonical lesser id
        nodeB: string; // canonical greater id
        forwardFrom: string; // actual "from" of forward edges
        forwardTo: string; // actual "to" of forward edges
        forwardCount: number;
        reverseCount: number;
        forwardLabels: string[];
        reverseLabels: string[];
        isBidirectional: boolean;
        isSelfLoop: boolean;
        strength: number; // max of forward/reverse count
        totalCount: number;
        // All raw edge indices in this bundle (for pending delete, retarget)
        forwardIndices: number[];
        reverseIndices: number[];
        // Geometry (computed)
        path: string;
        labelX: number;
        labelY: number;
        // Control points for t-parameter
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

    // Build raw edges
    const rawEdges: RawEdge[] = $derived.by(() => {
        if (!dimId) return [];
        const conns = project.getConnections(dimId);
        return conns.map((c, i) => ({
            index: i,
            from: c.from,
            to: c.to,
            label: c.label,
        }));
    });

    // Bundle edges
    const bundles: EdgeBundle[] = $derived.by(() => {
        if (!dimId) return [];

        // Group by unordered pair
        const map = new Map<
            string,
            {
                nodeA: string;
                nodeB: string;
                forward: RawEdge[]; // nodeA→nodeB direction
                reverse: RawEdge[]; // nodeB→nodeA direction
            }
        >();

        for (const edge of rawEdges) {
            const [a, b] =
                edge.from < edge.to
                    ? [edge.from, edge.to]
                    : [edge.to, edge.from];
            const pairKey =
                edge.from === edge.to ? `self:${edge.from}` : `${a}::${b}`;

            let entry = map.get(pairKey);
            if (!entry) {
                entry = { nodeA: a, nodeB: b, forward: [], reverse: [] };
                map.set(pairKey, entry);
            }

            if (edge.from === edge.to) {
                // Self-loop: all go into forward
                entry.forward.push(edge);
            } else if (edge.from === a) {
                entry.forward.push(edge);
            } else {
                entry.reverse.push(edge);
            }
        }

        const result: EdgeBundle[] = [];

        for (const [pairKey, entry] of map) {
            const isSelfLoop = entry.nodeA === entry.nodeB;
            const fromNode = layout.nodes[entry.nodeA];
            const toNode = layout.nodes[entry.nodeB];
            if (!fromNode || !toNode) continue;

            const forwardCount = entry.forward.length;
            const reverseCount = entry.reverse.length;
            const isBidirectional = reverseCount > 0 && forwardCount > 0;

            // Determine the "forward" direction for rendering
            // Forward = nodeA→nodeB (or all edges if self-loop)
            const forwardFrom = entry.nodeA;
            const forwardTo = entry.nodeB;

            const forwardLabels = entry.forward
                .map((e) => e.label)
                .filter((l): l is string => l !== null);
            const reverseLabels = entry.reverse
                .map((e) => e.label)
                .filter((l): l is string => l !== null);

            const strength = Math.max(forwardCount, reverseCount);
            const totalCount = forwardCount + reverseCount;

            // Build geometry from forwardFrom → forwardTo
            const geom = isSelfLoop
                ? buildSelfLoopGeometry(fromNode)
                : buildEdgeGeometry(
                      forwardFrom,
                      forwardTo,
                      layout.nodes[forwardFrom],
                      layout.nodes[forwardTo],
                  );

            if (!geom) continue;

            result.push({
                key: pairKey,
                nodeA: entry.nodeA,
                nodeB: entry.nodeB,
                forwardFrom,
                forwardTo,
                forwardCount,
                reverseCount,
                forwardLabels,
                reverseLabels,
                isBidirectional,
                isSelfLoop,
                strength,
                totalCount,
                forwardIndices: entry.forward.map((e) => e.index),
                reverseIndices: entry.reverse.map((e) => e.index),
                ...geom,
            });
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

    function isBundlePendingDelete(bundle: EdgeBundle): boolean {
        if (!dimId) return false;
        for (const idx of bundle.forwardIndices) {
            if (ui.isPendingDelete(dimId, idx)) return true;
        }
        for (const idx of bundle.reverseIndices) {
            if (ui.isPendingDelete(dimId, idx)) return true;
        }
        return false;
    }

    function isBundleBeingRetargeted(bundle: EdgeBundle): boolean {
        if (!dimId || ui.retargetDimId !== dimId || ui.retargetIndex === null)
            return false;
        return (
            bundle.forwardIndices.includes(ui.retargetIndex) ||
            bundle.reverseIndices.includes(ui.retargetIndex)
        );
    }

    // --- Geometry builders ---

    interface EdgeGeometry {
        path: string;
        labelX: number;
        labelY: number;
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        cp1x: number;
        cp1y: number;
        cp2x: number;
        cp2y: number;
    }

    function buildSelfLoopGeometry(node: NodeLayout): EdgeGeometry {
        const rx = node.x + node.width;
        const cy = node.y + node.height / 2;
        const loopW = 40;
        const loopH = 24;
        const path = `M ${rx} ${cy - loopH / 2} C ${rx + loopW} ${cy - loopH}, ${rx + loopW} ${cy + loopH}, ${rx} ${cy + loopH / 2}`;
        return {
            path,
            labelX: rx + loopW + 4,
            labelY: cy,
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

    function buildEdgeGeometry(
        fromId: string,
        toId: string,
        from: NodeLayout,
        to: NodeLayout,
    ): EdgeGeometry | null {
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
                path,
                labelX: lx,
                labelY: ly,
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
            path,
            labelX: lx,
            labelY: ly,
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

    function closestT(bundle: EdgeBundle, px: number, py: number): number {
        let bestT = 0;
        let bestDist = Infinity;
        const steps = 20;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const bx = bezierPoint(
                bundle.x1,
                bundle.cp1x,
                bundle.cp2x,
                bundle.x2,
                t,
            );
            const by = bezierPoint(
                bundle.y1,
                bundle.cp1y,
                bundle.cp2y,
                bundle.y2,
                t,
            );
            const d = (bx - px) * (bx - px) + (by - py) * (by - py);
            if (d < bestDist) {
                bestDist = d;
                bestT = t;
            }
        }
        return bestT;
    }

    // --- Stroke width from strength ---
    function strokeWidth(bundle: EdgeBundle): number {
        // base 1.5, each additional connection adds 1px, cap at 6
        return Math.min(1.5 + (bundle.strength - 1) * 1, 6);
    }

    // --- Label text for a bundle ---
    function bundleLabelText(bundle: EdgeBundle): string | null {
        const parts: string[] = [];
        if (bundle.forwardLabels.length) {
            const unique = [...new Set(bundle.forwardLabels)];
            for (const l of unique) {
                const count = bundle.forwardLabels.filter(
                    (x) => x === l,
                ).length;
                parts.push(count > 1 ? `${l} (×${count})` : l);
            }
        }
        if (bundle.reverseLabels.length) {
            const unique = [...new Set(bundle.reverseLabels)];
            for (const l of unique) {
                const count = bundle.reverseLabels.filter(
                    (x) => x === l,
                ).length;
                const prefix = bundle.isBidirectional ? "← " : "";
                parts.push(
                    count > 1 ? `${prefix}${l} (×${count})` : `${prefix}${l}`,
                );
            }
        }
        if (!parts.length) {
            // Show strength indicator if multi-connection but no labels
            if (bundle.totalCount > 1) {
                return `×${bundle.totalCount}`;
            }
            return null;
        }
        return parts.join(" / ");
    }

    // --- Reversed path for the reverse arrowhead ---
    function reversedPath(bundle: EdgeBundle): string {
        return `M ${bundle.x2} ${bundle.y2} C ${bundle.cp2x} ${bundle.cp2y}, ${bundle.cp1x} ${bundle.cp1y}, ${bundle.x1} ${bundle.y1}`;
    }

    // --- Label editing ---

    function startEditing(bundle: EdgeBundle) {
        editingBundleKey = bundle.key;
        // Edit the forward label by default; if no forward edges, edit reverse
        if (bundle.forwardCount > 0) {
            editingDirection = "forward";
            editValue = bundle.forwardLabels[0] ?? "";
        } else {
            editingDirection = "reverse";
            editValue = bundle.reverseLabels[0] ?? "";
        }
        editX = bundle.labelX;
        editY = bundle.labelY;
        requestAnimationFrame(() => {
            editInputEl?.focus();
            editInputEl?.select();
        });
    }

    function commitEdit() {
        if (!editingBundleKey || !dimId) return;
        const bundle = bundles.find((b) => b.key === editingBundleKey);
        if (!bundle) {
            editingBundleKey = null;
            return;
        }

        const trimmed = editValue.trim();
        const label = trimmed || null;

        if (editingDirection === "forward" && bundle.forwardCount > 0) {
            // Update label on all forward connections in this bundle
            project.updateConnectionLabel(
                dimId,
                bundle.forwardFrom,
                bundle.forwardTo,
                label,
            );
        } else if (editingDirection === "reverse" && bundle.reverseCount > 0) {
            // Reverse direction: from is nodeB→nodeA
            project.updateConnectionLabel(
                dimId,
                bundle.forwardTo,
                bundle.forwardFrom,
                label,
            );
        }

        editingBundleKey = null;
    }

    function cancelEdit() {
        editingBundleKey = null;
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

    // --- Bundle interactions ---

    function handleBundleContextMenu(e: MouseEvent, bundle: EdgeBundle) {
        e.preventDefault();
        e.stopPropagation();
        if (!dimId) return;
        // Mark all edges in this bundle for deletion
        const firstIdx = bundle.forwardIndices[0] ?? bundle.reverseIndices[0];
        if (firstIdx !== undefined) {
            ui.markConnectionForDelete(dimId, firstIdx);
        }
    }

    function handleBundleClick(e: MouseEvent, bundle: EdgeBundle) {
        if (e.button !== 0) return;
        e.stopPropagation();
        if (!dimId) return;

        if (isBundlePendingDelete(bundle)) {
            // Delete ALL connections in this bundle
            for (const edge of rawEdges) {
                if (
                    bundle.forwardIndices.includes(edge.index) ||
                    bundle.reverseIndices.includes(edge.index)
                ) {
                    project.removeConnection(dimId, edge.from, edge.to);
                }
            }
            ui.clearPendingDelete();
            return;
        }

        ui.clearPendingDelete();
    }

    function handleBundlePointerDown(e: PointerEvent, bundle: EdgeBundle) {
        if (e.button !== 0) return;
        if (dimId && isBundlePendingDelete(bundle)) return;
        if (bundle.isSelfLoop) return;

        dragBundle = bundle;
        dragStartX = ui.cursorWorldX;
        dragStartY = ui.cursorWorldY;
        dragActive = false;

        const t = closestT(bundle, ui.cursorWorldX, ui.cursorWorldY);
        dragHalf = t < 0.5 ? "source" : "target";

        window.addEventListener("pointermove", onDragMove);
        window.addEventListener("pointerup", onDragUp);
    }

    function onDragMove(_e: PointerEvent) {
        if (!dragBundle || !dimId) return;

        const dx = ui.cursorWorldX - dragStartX;
        const dy = ui.cursorWorldY - dragStartY;

        if (
            !dragActive &&
            dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD
        ) {
            dragActive = true;
            const bundle = dragBundle;
            // Use the first forward edge for retarget; if none, first reverse
            const edgeIdx =
                bundle.forwardIndices[0] ?? bundle.reverseIndices[0];
            if (edgeIdx === undefined) return;

            const edge = rawEdges[edgeIdx];
            if (!edge) return;

            if (dragHalf === "target") {
                ui.startRetarget(
                    dimId,
                    edgeIdx,
                    "target",
                    edge.from,
                    edge.to,
                    edge.label,
                );
            } else {
                ui.startRetarget(
                    dimId,
                    edgeIdx,
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
        dragBundle = null;
        dragActive = false;
    }
</script>

<svg role="img" aria-label="Connections between notes"
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
            id="conn-arrow-reverse"
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
        <!-- Stronger arrow markers for multi-connections -->
        <marker
            id="conn-arrow-strong"
            viewBox="0 0 10 6"
            refX="9"
            refY="3"
            markerWidth="10"
            markerHeight="8"
            orient="auto"
        >
            <path d="M 0 0.5 L 9 3 L 0 5.5 Z" class="arrow-fill" />
        </marker>
    </defs>

    {#each bundles as bundle (bundle.key)}
        {@const pendingDel = isBundlePendingDelete(bundle)}
        {@const retargeting = isBundleBeingRetargeted(bundle)}
        {@const sw = strokeWidth(bundle)}
        {@const labelText = bundleLabelText(bundle)}
        {@const isStrong = bundle.strength > 1}
        <g
            class="edge-group"
            class:pending-delete={pendingDel}
            class:retargeting
            class:strong={isStrong}
            in:fade={{ duration: 50, delay: 50 }}
            out:fade={{ duration: 50 }}
        >
            <!-- Hit area -->
            <path
                d={bundle.path}
                class="edge-hit"
                onclick={(e) => handleBundleClick(e, bundle)}
                oncontextmenu={(e) => handleBundleContextMenu(e, bundle)}
                onpointerdown={(e) => handleBundlePointerDown(e, bundle)}
                ondblclick={(e) => {
                    e.stopPropagation();
                    startEditing(bundle);
                }}
            />
            <!-- Forward arrow line -->
            <path
                d={bundle.path}
                class="edge-line"
                class:edge-line-delete={pendingDel}
                style:stroke-width="{sw}px"
                marker-end={pendingDel
                    ? "url(#conn-arrow-delete)"
                    : isStrong
                      ? "url(#conn-arrow-strong)"
                      : "url(#conn-arrow)"}
            />
            <!-- Reverse arrow (bidirectional) — invisible path in reverse direction for marker-end -->
            {#if bundle.isBidirectional && !bundle.isSelfLoop}
                <path
                    d={reversedPath(bundle)}
                    class="edge-line edge-line-reverse"
                    class:edge-line-delete={pendingDel}
                    style:stroke-width="{sw}px"
                    marker-end={pendingDel
                        ? "url(#conn-arrow-delete)"
                        : isStrong
                          ? "url(#conn-arrow-strong)"
                          : "url(#conn-arrow-reverse)"}
                />
            {/if}
            <!-- Label -->
            {#if labelText && editingBundleKey !== bundle.key}
                <g
                    class="edge-label-group"
                    ondblclick={(e) => {
                        e.stopPropagation();
                        startEditing(bundle);
                    }}
                >
                    <rect
                        x={bundle.labelX - labelText.length * 3.5 - 4}
                        y={bundle.labelY - 10}
                        width={labelText.length * 7 + 8}
                        height={20}
                        rx="4"
                        class="label-bg"
                    />
                    <text
                        x={bundle.labelX}
                        y={bundle.labelY + 4}
                        text-anchor="middle"
                        class="label-text"
                    >
                        {labelText}
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

{#if editingBundleKey !== null}
    <div
        class="label-edit-overlay"
        style:left="{editX}px"
        style:top="{editY}px"
    >
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
        pointer-events: none;
        transition:
            stroke 120ms ease,
            stroke-width 120ms ease;
    }

    /* Reverse line draws no visible stroke — it only carries the reverse arrowhead */
    .edge-line-reverse {
        stroke: transparent;
    }

    .edge-line-delete {
        stroke: var(--color-red);
    }

    /* On hover, show both lines */
    .edge-group:hover .edge-line {
        stroke: var(--text-muted);
    }
    .edge-group:hover .edge-line-reverse {
        stroke: transparent;
    }

    .edge-group.pending-delete .edge-line {
        stroke: var(--color-red);
    }
    .edge-group.pending-delete:hover .edge-line {
        stroke: var(--color-red);
    }
    .edge-group.pending-delete .edge-hit {
        cursor: pointer;
    }

    /* Strong connections — subtle glow */
    .edge-group.strong .edge-line:not(.edge-line-reverse) {
        filter: drop-shadow(0 0 2px var(--text-faint));
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
