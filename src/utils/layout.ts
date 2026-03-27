import type { Connection, ProjectData, Spectrum } from "../types";

export interface NodeLayout {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface GroupLayout {
    x: number;
    y: number;
    width: number;
    height: number;
    name: string;
}

export interface LayoutResult {
    nodes: Record<string, NodeLayout>;
    groups: Record<string, GroupLayout>;
    /** If spectra are active, provides stop positions for the canvas overlay */
    xSpectrum?: SpectrumLayout;
    ySpectrum?: SpectrumLayout;
}

export interface SpectrumLayout {
    name: string;
    poles: [string, string];
    stops: { name: string; position: number }[];
    /** Total extent in pixels along this axis */
    extent: number;
}

export interface LayoutOptions {
    nodeWidth?: number;
    nodeGap?: number;
    groupGap?: number;
    groupPadding?: number;
    gridColumns?: number;
}

function estimateNodeHeight(
    title: string,
    short: string,
    contentWidth: number,
): number {
    const charPerLine = Math.max(1, Math.floor(contentWidth / 8));
    const titleLines = Math.max(1, Math.ceil(title.length / (charPerLine * 0.6)));
    const textLines = short ? Math.ceil(short.length / charPerLine) : 0;
    const titleHeight = titleLines * 28;
    const textHeight = textLines * 22;
    const padding = 48;
    return Math.max(60, padding + titleHeight + textHeight);
}

/**
 * Build undirected adjacency between groups based on inter-group connections.
 */
function buildGroupAdjacency(
    connections: Connection[],
    notes: ProjectData["notes"],
    dimId: string,
    validGroupIds: Set<string>,
): Map<string, Set<string>> {
    const adj = new Map<string, Set<string>>();
    for (const gid of validGroupIds) adj.set(gid, new Set());

    for (const conn of connections) {
        const fNote = notes[conn.from];
        const tNote = notes[conn.to];
        if (!fNote || !tNote) continue;

        const fg = fNote.membership[dimId] ?? "__ungrouped";
        const tg = tNote.membership[dimId] ?? "__ungrouped";
        if (fg === tg) continue;
        if (!validGroupIds.has(fg) || !validGroupIds.has(tg)) continue;

        adj.get(fg)!.add(tg);
        adj.get(tg)!.add(fg);
    }
    return adj;
}

function findComponents(
    nodeIds: string[],
    adj: Map<string, Set<string>>,
): string[][] {
    const remaining = new Set(nodeIds);
    const components: string[][] = [];

    for (const start of nodeIds) {
        if (!remaining.has(start)) continue;
        const comp: string[] = [];
        const stack = [start];
        while (stack.length) {
            const n = stack.pop()!;
            if (!remaining.has(n)) continue;
            remaining.delete(n);
            comp.push(n);
            for (const nb of adj.get(n) ?? []) {
                if (remaining.has(nb)) stack.push(nb);
            }
        }
        components.push(comp);
    }
    return components;
}

interface GroupPlacement {
    col: number;
    row: number;
}

function computeGroupPlacements(
    adj: Map<string, Set<string>>,
    allGroupIds: string[],
): Map<string, GroupPlacement> {
    const placement = new Map<string, GroupPlacement>();

    let root = allGroupIds[0];
    let maxDeg = -1;
    for (const [id, neighbors] of adj) {
        if (neighbors.size > maxDeg) {
            maxDeg = neighbors.size;
            root = id;
        }
    }

    if (maxDeg <= 0) {
        for (let i = 0; i < allGroupIds.length; i++) {
            placement.set(allGroupIds[i], { col: i, row: 0 });
        }
        return placement;
    }

    const visited = new Set<string>();
    const colRows = new Map<number, number>();

    function placeAt(id: string, col: number) {
        const row = colRows.get(col) ?? 0;
        placement.set(id, { col, row });
        colRows.set(col, row + 1);
        visited.add(id);
    }

    placeAt(root, 0);

    let frontier = [root];
    while (frontier.length) {
        const nextFrontier: string[] = [];

        for (const current of frontier) {
            const currentCol = placement.get(current)!.col;
            const unvisited = [...(adj.get(current) ?? [])].filter(
                (n) => !visited.has(n),
            );
            if (!unvisited.length) continue;

            if (currentCol === 0) {
                const components = findComponents(unvisited, adj);
                if (components.length === 1) {
                    for (const id of components[0]) {
                        placeAt(id, 1);
                        nextFrontier.push(id);
                    }
                } else {
                    let left = true;
                    for (const comp of components) {
                        const col = left ? -1 : 1;
                        for (const id of comp) {
                            placeAt(id, col);
                            nextFrontier.push(id);
                        }
                        left = !left;
                    }
                }
            } else {
                const direction = currentCol > 0 ? 1 : -1;
                for (const id of unvisited) {
                    placeAt(id, currentCol + direction);
                    nextFrontier.push(id);
                }
            }
        }

        frontier = nextFrontier;
    }

    const maxCol = Math.max(...[...placement.values()].map((p) => p.col), 0);
    let extraCol = maxCol + 1;
    for (const id of allGroupIds) {
        if (!visited.has(id)) {
            placeAt(id, extraCol);
            extraCol++;
        }
    }

    return placement;
}

/**
 * Compute pixel position for a stop index within a spectrum.
 * 0% = first stop, 100% = last stop.
 * Returns center position for the group at that stop.
 */
function stopPosition(
    stopIndex: number,
    totalStops: number,
    extent: number,
    groupSize: number,
    margin: number,
): number {
    if (totalStops <= 1) return margin;
    const usable = extent - margin * 2 - groupSize;
    return margin + (stopIndex / (totalStops - 1)) * usable;
}

export function layoutEngine(
    project: ProjectData,
    activeDimensionId: string | null,
    options: LayoutOptions = {},
): LayoutResult {
    const {
        nodeWidth = 200,
        nodeGap = 24,
        groupGap = 60,
        groupPadding = 40,
        gridColumns = 3,
    } = options;

    const contentWidth = nodeWidth - 32;
    const result: LayoutResult = { nodes: {}, groups: {} };
    const noteIds = Object.keys(project.notes);
    // if (!noteIds.length) return result;

    function heightOf(id: string): number {
        const note = project.notes[id];
        return estimateNodeHeight(note.title, note.short, contentWidth);
    }

    const dim = activeDimensionId
        ? project.dimensions[activeDimensionId]
        : null;

    // No dimension — flat grid fallback
    if (!dim || !activeDimensionId) {
        const colHeights = new Array(gridColumns).fill(0);
        for (let i = 0; i < noteIds.length; i++) {
            let col = 0;
            for (let c = 1; c < gridColumns; c++) {
                if (colHeights[c] < colHeights[col]) col = c;
            }
            const h = heightOf(noteIds[i]);
            result.nodes[noteIds[i]] = {
                x: col * (nodeWidth + nodeGap),
                y: colHeights[col],
                width: nodeWidth,
                height: h,
            };
            colHeights[col] += h + nodeGap;
        }
        return result;
    }

    // --- Bucket notes by group ---
    const buckets: Record<string, string[]> = {};
    for (const g of dim.groups) buckets[g.id] = [];
    const ungrouped: string[] = [];

    for (const id of noteIds) {
        const gid = project.notes[id].membership[activeDimensionId];
        if (gid && buckets[gid]) buckets[gid].push(id);
        else ungrouped.push(id);
    }

    // Apply node_order
    for (const g of dim.groups) {
        const key = `${activeDimensionId}:${g.id}`;
        const order = project.node_order?.[key];
        if (order?.length) {
            const set = new Set(buckets[g.id]);
            const ordered = order.filter((id) => set.has(id));
            const rest = buckets[g.id].filter((id) => !order.includes(id));
            buckets[g.id] = [...ordered, ...rest];
        }
    }

    const LABEL_H = 40;
    const groupWidth = nodeWidth + groupPadding * 2;

    const xSpec = dim["x-spectrum"] as Spectrum | undefined;
    const ySpec = dim["y-spectrum"] as Spectrum | undefined;
    const hasSpectra = !!xSpec || !!ySpec;

    // ========================================================================
    // SPECTRUM LAYOUT
    // ========================================================================
    if (hasSpectra) {
        return layoutWithSpectra(
            project,
            activeDimensionId,
            dim,
            buckets,
            ungrouped,
            noteIds,
            xSpec ?? null,
            ySpec ?? null,
            nodeWidth,
            nodeGap,
            groupGap,
            groupPadding,
            LABEL_H,
            groupWidth,
            contentWidth,
        );
    }

    // ========================================================================
    // ORIGINAL BFS ADJACENCY LAYOUT (no spectra)
    // ========================================================================
    const allGroupIds = dim.groups.map((g) => g.id);
    if (ungrouped.length) allGroupIds.push("__ungrouped");

    const connections = project.connections[activeDimensionId] || [];
    const adj = buildGroupAdjacency(
        connections,
        project.notes,
        activeDimensionId,
        new Set(allGroupIds),
    );
    const placements = computeGroupPlacements(adj, allGroupIds);

    const minCol = Math.min(...[...placements.values()].map((p) => p.col));
    for (const p of placements.values()) p.col -= minCol;

    const columns = new Map<number, string[]>();
    for (const [id, p] of placements) {
        let list = columns.get(p.col);
        if (!list) {
            list = [];
            columns.set(p.col, list);
        }
        list.push(id);
    }
    for (const ids of columns.values()) {
        ids.sort((a, b) => placements.get(a)!.row - placements.get(b)!.row);
    }

    const sortedCols = [...columns.keys()].sort((a, b) => a - b);

    for (const col of sortedCols) {
        const groupIds = columns.get(col)!;
        const x = col * (groupWidth + groupGap);
        let cursorY = 0;

        for (const groupId of groupIds) {
            const members =
                groupId === "__ungrouped" ? ungrouped : buckets[groupId] || [];
            const groupName =
                groupId === "__ungrouped"
                    ? "Ungrouped"
                    : (dim.groups.find((g) => g.id === groupId)?.name ?? "");

            let innerY = cursorY + LABEL_H + groupPadding;
            for (const noteId of members) {
                const h = heightOf(noteId);
                result.nodes[noteId] = {
                    x: x + groupPadding,
                    y: innerY,
                    width: nodeWidth,
                    height: h,
                };
                innerY += h + nodeGap;
            }

            const gh =
                members.length > 0
                    ? innerY - cursorY - nodeGap + groupPadding
                    : LABEL_H + groupPadding * 2;

            result.groups[groupId] = {
                x,
                y: cursorY,
                width: groupWidth,
                height: gh,
                name: groupName,
            };

            cursorY += gh + groupGap;
        }
    }

    return result;
}

function layoutWithSpectra(
    project: ProjectData,
    dimId: string,
    dim: ProjectData["dimensions"][string],
    buckets: Record<string, string[]>,
    ungrouped: string[],
    _noteIds: string[],
    xSpec: Spectrum | null,
    ySpec: Spectrum | null,
    nodeWidth: number,
    nodeGap: number,
    groupGap: number,
    groupPadding: number,
    LABEL_H: number,
    groupWidth: number,
    contentWidth: number,
): LayoutResult {
    const result: LayoutResult = { nodes: {}, groups: {} };

    function heightOf(id: string): number {
        const note = project.notes[id];
        return estimateNodeHeight(note.title, note.short, contentWidth);
    }

    function groupContentHeight(members: string[]): number {
        let h = LABEL_H + groupPadding;
        for (const noteId of members) {
            h += heightOf(noteId) + nodeGap;
        }
        return members.length > 0 ? h - nodeGap + groupPadding : LABEL_H + groupPadding * 2;
    }

    const xStopIndex = new Map<string, number>();
    const yStopIndex = new Map<string, number>();
    if (xSpec) xSpec.stops.forEach((s, i) => xStopIndex.set(s, i));
    if (ySpec) ySpec.stops.forEach((s, i) => yStopIndex.set(s, i));

    const xStopCount = xSpec ? xSpec.stops.length : 1;
    const yStopCount = ySpec ? ySpec.stops.length : 1;

    // Pre-compute group heights to determine per-row max height
    // Grid: xStopCount columns × yStopCount rows
    // Groups without stop assignment go to a separate "unplaced" area

    interface GroupInfo {
        id: string;
        name: string;
        members: string[];
        xIdx: number; // -1 = unplaced
        yIdx: number; // -1 = unplaced
        contentH: number;
    }

    const groups: GroupInfo[] = [];
    for (const g of dim.groups) {
        const members = buckets[g.id] || [];
        const xIdx = g.x && xStopIndex.has(g.x) ? xStopIndex.get(g.x)! : (xSpec ? -1 : 0);
        const yIdx = g.y && yStopIndex.has(g.y) ? yStopIndex.get(g.y)! : (ySpec ? -1 : 0);
        groups.push({
            id: g.id,
            name: g.name,
            members,
            xIdx,
            yIdx,
            contentH: groupContentHeight(members),
        });
    }

    // Add ungrouped bucket
    if (ungrouped.length) {
        groups.push({
            id: "__ungrouped",
            name: "Ungrouped",
            members: ungrouped,
            xIdx: -1,
            yIdx: -1,
            contentH: groupContentHeight(ungrouped),
        });
    }

    // Separate placed vs unplaced groups
    const placed = groups.filter((g) => g.xIdx >= 0 && g.yIdx >= 0);
    const unplaced = groups.filter((g) => g.xIdx < 0 || g.yIdx < 0);

    // Build grid: cell -> list of groups at that position
    const grid = new Map<string, GroupInfo[]>();
    for (const g of placed) {
        const key = `${g.xIdx},${g.yIdx}`;
        const list = grid.get(key) || [];
        list.push(g);
        grid.set(key, list);
    }

    // Compute per-column width (all same) and per-row max height
    const rowMaxH = new Array(yStopCount).fill(LABEL_H + groupPadding * 2);
    for (const g of placed) {
        const cellKey = `${g.xIdx},${g.yIdx}`;
        // Stack groups at same cell, so sum their heights
        const cellGroups = grid.get(cellKey) || [];
        let totalH = 0;
        for (const cg of cellGroups) totalH += cg.contentH + groupGap;
        totalH -= groupGap;
        rowMaxH[g.yIdx] = Math.max(rowMaxH[g.yIdx], totalH);
    }

    // Compute row Y positions and column X positions
    const SPECTRUM_MARGIN = 80;
    const colWidth = groupWidth;

    // Total extent
    const xExtent = Math.max(
        (xStopCount) * (colWidth + groupGap) - groupGap + SPECTRUM_MARGIN * 2,
        colWidth + SPECTRUM_MARGIN * 2,
    );
    const totalRowH = rowMaxH.reduce((a, b) => a + b, 0) + (yStopCount - 1) * groupGap;
    const yExtent = Math.max(
        totalRowH + SPECTRUM_MARGIN * 2,
        LABEL_H + groupPadding * 2 + SPECTRUM_MARGIN * 2,
    );

    // Row Y offsets
    const rowY: number[] = [];
    let yAccum = SPECTRUM_MARGIN;
    for (let r = 0; r < yStopCount; r++) {
        rowY.push(yAccum);
        yAccum += rowMaxH[r] + groupGap;
    }

    // Column X offsets
    const colX: number[] = [];
    for (let c = 0; c < xStopCount; c++) {
        colX.push(SPECTRUM_MARGIN + c * (colWidth + groupGap));
    }

    // Place groups on the grid
    // Track per-cell Y cursor for stacking multiple groups in same cell
    const cellCursor = new Map<string, number>();

    for (const g of placed) {
        const cellKey = `${g.xIdx},${g.yIdx}`;
        let cellY = cellCursor.get(cellKey) ?? rowY[g.yIdx];
        const gx = colX[g.xIdx];

        placeGroup(g, gx, cellY);
        cellCursor.set(cellKey, cellY + g.contentH + groupGap);
    }

    // Place unplaced groups below the spectrum grid
    let unplacedY = yAccum + groupGap;
    let unplacedX = SPECTRUM_MARGIN;
    for (const g of unplaced) {
        placeGroup(g, unplacedX, unplacedY);
        unplacedX += colWidth + groupGap;
        // Wrap after a few columns
        if (unplacedX > xExtent - colWidth) {
            unplacedX = SPECTRUM_MARGIN;
            unplacedY += g.contentH + groupGap;
        }
    }

    function placeGroup(g: GroupInfo, gx: number, gy: number) {
        let innerY = gy + LABEL_H + groupPadding;
        for (const noteId of g.members) {
            const h = heightOf(noteId);
            result.nodes[noteId] = {
                x: gx + groupPadding,
                y: innerY,
                width: nodeWidth,
                height: h,
            };
            innerY += h + nodeGap;
        }

        result.groups[g.id] = {
            x: gx,
            y: gy,
            width: colWidth,
            height: g.contentH,
            name: g.name,
        };
    }

    // Build spectrum layout info for the canvas overlay
    if (xSpec) {
        result.xSpectrum = {
            name: xSpec.name,
            poles: xSpec.poles,
            stops: xSpec.stops.map((name, i) => ({
                name,
                position: colX[i] + colWidth / 2,
            })),
            extent: xExtent,
        };
    }

    if (ySpec) {
        result.ySpectrum = {
            name: ySpec.name,
            poles: ySpec.poles,
            stops: ySpec.stops.map((name, i) => ({
                name,
                position: rowY[i] + rowMaxH[i] / 2,
            })),
            extent: yExtent,
        };
    }

    return result;
}