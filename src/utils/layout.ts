import type { Connection, ProjectData, Spectrum } from "../types";

function getConnectionsForDimension(
    project: ProjectData,
    dimId: string,
): Connection[] {
    if (!dimId) return [];
    const result: Connection[] = [];
    for (const [fromId, note] of Object.entries(project.notes)) {
        const outgoing = note.connections?.[dimId] ?? [];
        for (const c of outgoing) {
            result.push({ from: fromId, to: c.to, label: c.label });
        }
    }
    return result;
}

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
    xSpectrum?: SpectrumLayout;
    ySpectrum?: SpectrumLayout;
}

export interface SpectrumLayout {
    name: string;
    poles: [string, string];
    stops: { name: string; position: number }[];
    extent: number;
}

export interface LayoutOptions {
    nodeWidth?: number;
    nodeGap?: number;
    groupGap?: number;
    groupPadding?: number;
    gridColumns?: number;
}

// ---------------------------------------------------------------------------
// Node height estimation
// ---------------------------------------------------------------------------
// Previous approach: naive charCount / charsPerLine. Problems:
//   - Doesn't respect word boundaries (wrap happens at words, not chars)
//   - Title uses a different (larger) font than body — was using same metric
//   - Markdown syntax characters were counted as visible width
//   - No minimum line count for short content with tall line-height
//   - Padding constant was too small
//
// New approach: word-wrap simulation with separate title/body metrics,
// conservative rounding, and explicit per-section padding.

/** Approximate average character width in px for a given font-size tier. */
const CHAR_W_TITLE = 10;   // ~h1 at default Obsidian theme ≈ 1.5em
const CHAR_W_BODY = 7.2;   // ~14px body text

const TITLE_LINE_H = 32;   // line-height for title
const BODY_LINE_H = 24;    // line-height for body text

const NODE_PAD_TOP = 12;   // padding above title
const NODE_PAD_MID = 8;    // gap between title and body
const NODE_PAD_BOTTOM = 16; // padding below body

const NODE_MIN_H = 64;

/**
 * Estimate how many visual lines a string occupies when word-wrapped
 * into `maxWidth` pixels with a given average character width.
 */
function estimateLines(text: string, maxWidthPx: number, charW: number): number {
    if (!text) return 0;

    const charsPerLine = Math.max(1, Math.floor(maxWidthPx / charW));
    const paragraphs = text.split(/\n/);
    let lines = 0;

    for (const para of paragraphs) {
        if (para.trim() === "") {
            lines += 1; // blank line
            continue;
        }
        const words = para.split(/\s+/).filter(Boolean);
        let lineLen = 0;
        let paraLines = 1;

        for (const word of words) {
            // Strip common markdown syntax from width calc
            const visLen = word.replace(/[*_~`#\[\]()]/g, "").length;
            if (lineLen === 0) {
                lineLen = visLen;
            } else if (lineLen + 1 + visLen > charsPerLine) {
                paraLines++;
                lineLen = visLen;
            } else {
                lineLen += 1 + visLen;
            }
        }
        lines += paraLines;
    }

    return Math.max(1, lines);
}

function estimateNodeHeight(
    title: string,
    short: string,
    contentWidth: number,
): number {
    const titleLines = estimateLines(title, contentWidth, CHAR_W_TITLE);
    const titleH = titleLines * TITLE_LINE_H;

    let bodyH = 0;
    if (short) {
        const bodyLines = estimateLines(short, contentWidth, CHAR_W_BODY);
        bodyH = bodyLines * BODY_LINE_H;
    }

    const total = NODE_PAD_TOP + titleH + (short ? NODE_PAD_MID + bodyH : 0) + NODE_PAD_BOTTOM;
    return Math.max(NODE_MIN_H, total);
}

// ---------------------------------------------------------------------------
// Group adjacency / BFS (unchanged logic)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helper: place nodes inside a group and return the group's actual height
// ---------------------------------------------------------------------------

const LABEL_H = 40;

/**
 * Lay out `members` vertically inside a group starting at (gx, gy).
 * Writes into `result.nodes` and returns the computed group height
 * that exactly wraps all children with proper padding.
 */
function placeNodesInGroup(
    members: string[],
    gx: number,
    gy: number,
    nodeWidth: number,
    nodeGap: number,
    groupPadding: number,
    heightOf: (id: string) => number,
    result: LayoutResult,
): number {
    if (members.length === 0) {
        return LABEL_H + groupPadding * 2;
    }

    const startY = gy + LABEL_H + groupPadding;
    let cursorY = startY;

    for (const noteId of members) {
        const h = heightOf(noteId);
        result.nodes[noteId] = {
            x: gx + groupPadding,
            y: cursorY,
            width: nodeWidth,
            height: h,
        };
        cursorY += h + nodeGap;
    }

    // Group height = from group top to last node bottom + padding
    // cursorY currently points past the last nodeGap, subtract it, add bottom padding
    const groupHeight = (cursorY - nodeGap) - gy + groupPadding;
    return groupHeight;
}

// ---------------------------------------------------------------------------
// Main layout engine
// ---------------------------------------------------------------------------

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

    const groupWidth = nodeWidth + groupPadding * 2;

    const xSpec = dim["x-spectrum"] as Spectrum | undefined;
    const ySpec = dim["y-spectrum"] as Spectrum | undefined;
    const hasSpectra = !!xSpec || !!ySpec;

    if (hasSpectra) {
        return layoutWithSpectra(
            project, activeDimensionId, dim,
            buckets, ungrouped,
            xSpec ?? null, ySpec ?? null,
            nodeWidth, nodeGap, groupGap, groupPadding, groupWidth, contentWidth,
        );
    }

    // ======================================================================
    // BFS ADJACENCY LAYOUT (no spectra)
    // ======================================================================
    const allGroupIds = dim.groups.map((g) => g.id);
    if (ungrouped.length) allGroupIds.push("__ungrouped");

    const connections = getConnectionsForDimension(project, activeDimensionId);
    const adj = buildGroupAdjacency(
        connections, project.notes, activeDimensionId, new Set(allGroupIds),
    );
    const placements = computeGroupPlacements(adj, allGroupIds);

    const minCol = Math.min(...[...placements.values()].map((p) => p.col));
    for (const p of placements.values()) p.col -= minCol;

    const columns = new Map<number, string[]>();
    for (const [id, p] of placements) {
        let list = columns.get(p.col);
        if (!list) { list = []; columns.set(p.col, list); }
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

            const gh = placeNodesInGroup(
                members, x, cursorY,
                nodeWidth, nodeGap, groupPadding,
                heightOf, result,
            );

            result.groups[groupId] = {
                x, y: cursorY,
                width: groupWidth, height: gh,
                name: groupName,
            };

            cursorY += gh + groupGap;
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// Spectrum layout
// ---------------------------------------------------------------------------

function layoutWithSpectra(
    project: ProjectData,
    dimId: string,
    dim: ProjectData["dimensions"][string],
    buckets: Record<string, string[]>,
    ungrouped: string[],
    xSpec: Spectrum | null,
    ySpec: Spectrum | null,
    nodeWidth: number,
    nodeGap: number,
    groupGap: number,
    groupPadding: number,
    groupWidth: number,
    contentWidth: number,
): LayoutResult {
    const result: LayoutResult = { nodes: {}, groups: {} };

    function heightOf(id: string): number {
        const note = project.notes[id];
        return estimateNodeHeight(note.title, note.short, contentWidth);
    }

    /**
     * Compute exact group content height by summing actual node heights.
     * This must match what placeNodesInGroup will produce.
     */
    function groupContentHeight(members: string[]): number {
        if (members.length === 0) return LABEL_H + groupPadding * 2;
        let h = LABEL_H + groupPadding; // top: label + top padding
        for (const noteId of members) {
            h += heightOf(noteId) + nodeGap;
        }
        // Remove trailing gap, add bottom padding
        h = h - nodeGap + groupPadding;
        return h;
    }

    const xStopIndex = new Map<string, number>();
    const yStopIndex = new Map<string, number>();
    if (xSpec) xSpec.stops.forEach((s, i) => xStopIndex.set(s, i));
    if (ySpec) ySpec.stops.forEach((s, i) => yStopIndex.set(s, i));

    const xStopCount = xSpec ? xSpec.stops.length : 1;
    const yStopCount = ySpec ? ySpec.stops.length : 1;

    interface GroupInfo {
        id: string;
        name: string;
        members: string[];
        xIdx: number;
        yIdx: number;
        contentH: number;
    }

    const groups: GroupInfo[] = [];
    for (const g of dim.groups) {
        const members = buckets[g.id] || [];
        const xIdx = g.x && xStopIndex.has(g.x) ? xStopIndex.get(g.x)! : (xSpec ? -1 : 0);
        const yIdx = g.y && yStopIndex.has(g.y) ? yStopIndex.get(g.y)! : (ySpec ? -1 : 0);
        groups.push({
            id: g.id, name: g.name, members,
            xIdx, yIdx,
            contentH: groupContentHeight(members),
        });
    }

    if (ungrouped.length) {
        groups.push({
            id: "__ungrouped", name: "Ungrouped", members: ungrouped,
            xIdx: -1, yIdx: -1,
            contentH: groupContentHeight(ungrouped),
        });
    }

    const placed = groups.filter((g) => g.xIdx >= 0 && g.yIdx >= 0);
    const unplaced = groups.filter((g) => g.xIdx < 0 || g.yIdx < 0);

    // Build grid: cell -> stacked groups
    const grid = new Map<string, GroupInfo[]>();
    for (const g of placed) {
        const key = `${g.xIdx},${g.yIdx}`;
        const list = grid.get(key) || [];
        list.push(g);
        grid.set(key, list);
    }

    // Per-row max height: compute from actual stacked cell heights
    const rowMaxH = new Array(yStopCount).fill(LABEL_H + groupPadding * 2);
    for (let r = 0; r < yStopCount; r++) {
        for (let c = 0; c < xStopCount; c++) {
            const cellGroups = grid.get(`${c},${r}`);
            if (!cellGroups || cellGroups.length === 0) continue;
            let totalH = 0;
            for (const cg of cellGroups) totalH += cg.contentH + groupGap;
            totalH -= groupGap; // no trailing gap
            rowMaxH[r] = Math.max(rowMaxH[r], totalH);
        }
    }

    const SPECTRUM_MARGIN = 80;
    const colWidth = groupWidth;

    const xExtent = Math.max(
        xStopCount * (colWidth + groupGap) - groupGap + SPECTRUM_MARGIN * 2,
        colWidth + SPECTRUM_MARGIN * 2,
    );
    const totalRowH = rowMaxH.reduce((a, b) => a + b, 0) + (yStopCount - 1) * groupGap;
    const yExtent = Math.max(
        totalRowH + SPECTRUM_MARGIN * 2,
        LABEL_H + groupPadding * 2 + SPECTRUM_MARGIN * 2,
    );

    const rowY: number[] = [];
    let yAccum = SPECTRUM_MARGIN;
    for (let r = 0; r < yStopCount; r++) {
        rowY.push(yAccum);
        yAccum += rowMaxH[r] + groupGap;
    }

    const colX: number[] = [];
    for (let c = 0; c < xStopCount; c++) {
        colX.push(SPECTRUM_MARGIN + c * (colWidth + groupGap));
    }

    // Place groups on grid
    const cellCursor = new Map<string, number>();

    for (const g of placed) {
        const cellKey = `${g.xIdx},${g.yIdx}`;
        const cellY = cellCursor.get(cellKey) ?? rowY[g.yIdx];
        const gx = colX[g.xIdx];

        const gh = placeNodesInGroup(
            g.members, gx, cellY,
            nodeWidth, nodeGap, groupPadding,
            heightOf, result,
        );

        result.groups[g.id] = {
            x: gx, y: cellY,
            width: colWidth, height: gh,
            name: g.name,
        };

        cellCursor.set(cellKey, cellY + gh + groupGap);
    }

    // Place unplaced groups below the grid
    let unplacedY = yAccum + groupGap;
    let unplacedX = SPECTRUM_MARGIN;
    for (const g of unplaced) {
        const gh = placeNodesInGroup(
            g.members, unplacedX, unplacedY,
            nodeWidth, nodeGap, groupPadding,
            heightOf, result,
        );

        result.groups[g.id] = {
            x: unplacedX, y: unplacedY,
            width: colWidth, height: gh,
            name: g.name,
        };

        unplacedX += colWidth + groupGap;
        if (unplacedX > xExtent - colWidth) {
            unplacedX = SPECTRUM_MARGIN;
            unplacedY += gh + groupGap;
        }
    }

    // Spectrum overlay info
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