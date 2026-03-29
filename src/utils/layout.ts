import type { ProjectData, Spectrum } from "../types";
import { DEFAULT_FONTS, measureTextHeight, type FontConfig } from "./textMeasure";

const DEFAULT_NODE_WIDTH = 200;

function noteWidth(project: ProjectData, noteId: string): number {
    return project.notes[noteId]?.width ?? DEFAULT_NODE_WIDTH;
}

function getConnectionsForDimension(
    project: ProjectData,
    dimId: string,
): { from: string; to: string; label: string | null }[] {
    if (!dimId) return [];
    const result: { from: string; to: string; label: string | null }[] = [];
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
    nodeGap?: number;
    groupGap?: number;
    groupPadding?: number;
    gridColumns?: number;
    fonts?: FontConfig;
}

// ---------------------------------------------------------------------------
// Node height via pretext
// ---------------------------------------------------------------------------

const NODE_PAD_TOP = 12;
const NODE_PAD_MID = 8;
const NODE_PAD_BOTTOM = 8;
const NODE_MIN_H = 64;

function estimateNodeHeight(
    title: string,
    short: string,
    nw: number,
    fonts: FontConfig,
): number {
    const contentWidth = nw - 32;
    const titleH = measureTextHeight(
        title, fonts.titleFont, contentWidth, fonts.titleLineHeight,
    ).height;

    let bodyH = 0;
    if (short) {
        bodyH = measureTextHeight(
            short, fonts.bodyFont, contentWidth, fonts.bodyLineHeight,
        ).height;
    }

    const total =
        NODE_PAD_TOP + titleH + (short ? NODE_PAD_MID + bodyH : 0) + NODE_PAD_BOTTOM;
    return Math.max(NODE_MIN_H, total);
}

// ---------------------------------------------------------------------------
// Group adjacency / BFS (unchanged)
// ---------------------------------------------------------------------------

function buildGroupAdjacency(
    connections: { from: string; to: string; label: string | null }[],
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
// Helper: compute group width from its members
// ---------------------------------------------------------------------------

function groupWidthForMembers(
    members: string[],
    project: ProjectData,
    groupPadding: number,
): number {
    let maxNw = DEFAULT_NODE_WIDTH;
    for (const id of members) {
        maxNw = Math.max(maxNw, noteWidth(project, id));
    }
    return maxNw + groupPadding * 2;
}

// ---------------------------------------------------------------------------
// Helper: place nodes inside a group
// ---------------------------------------------------------------------------

const LABEL_H = 40;

function placeNodesInGroup(
    members: string[],
    project: ProjectData,
    gx: number,
    gy: number,
    nodeGap: number,
    groupPadding: number,
    groupWidth: number,
    fonts: FontConfig,
    result: LayoutResult,
): number {
    if (members.length === 0) {
        return LABEL_H + groupPadding * 2;
    }

    const startY = gy + LABEL_H + groupPadding;
    let cursorY = startY;

    for (const noteId of members) {
        const nw = noteWidth(project, noteId);
        const h = estimateNodeHeight(
            project.notes[noteId].title,
            project.notes[noteId].short,
            nw,
            fonts,
        );
        result.nodes[noteId] = {
            x: gx + groupPadding,
            y: cursorY,
            width: nw,
            height: h,
        };
        cursorY += h + nodeGap;
    }

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
        nodeGap = 24,
        groupGap = 60,
        groupPadding = 40,
        gridColumns = 3,
        fonts = DEFAULT_FONTS,
    } = options;

    const result: LayoutResult = { nodes: {}, groups: {} };
    const noteIds = Object.keys(project.notes);

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
            const nw = noteWidth(project, noteIds[i]);
            const h = estimateNodeHeight(
                project.notes[noteIds[i]].title,
                project.notes[noteIds[i]].short,
                nw,
                fonts,
            );
            result.nodes[noteIds[i]] = {
                x: col * (DEFAULT_NODE_WIDTH + nodeGap),
                y: colHeights[col],
                width: nw,
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

    const xSpec = dim["x-spectrum"] as Spectrum | undefined;
    const ySpec = dim["y-spectrum"] as Spectrum | undefined;
    const hasSpectra = !!xSpec || !!ySpec;

    if (hasSpectra) {
        return layoutWithSpectra(
            project, activeDimensionId, dim,
            buckets, ungrouped,
            xSpec ?? null, ySpec ?? null,
            nodeGap, groupGap, groupPadding, fonts,
        );
    }

    // ======================================================================
    // BFS ADJACENCY LAYOUT (no spectra)
    // ======================================================================
    const allGroupIds = dim.groups.map((g) => g.id);
    if (ungrouped.length) allGroupIds.push("__ungrouped");

    // Compute per-column max group width
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

    // Find widest group in each column
    const colMaxWidth = new Map<number, number>();
    for (const [col, groupIds] of columns) {
        let maxW = DEFAULT_NODE_WIDTH + groupPadding * 2;
        for (const gid of groupIds) {
            const members = gid === "__ungrouped" ? ungrouped : buckets[gid] || [];
            maxW = Math.max(maxW, groupWidthForMembers(members, project, groupPadding));
        }
        colMaxWidth.set(col, maxW);
    }

    const sortedCols = [...columns.keys()].sort((a, b) => a - b);

    // Compute column X offsets
    const colXOffset = new Map<number, number>();
    let xAccum = 0;
    for (const col of sortedCols) {
        colXOffset.set(col, xAccum);
        xAccum += colMaxWidth.get(col)! + groupGap;
    }

    for (const col of sortedCols) {
        const groupIds = columns.get(col)!;
        const x = colXOffset.get(col)!;
        const gw = colMaxWidth.get(col)!;
        let cursorY = 0;

        for (const groupId of groupIds) {
            const members =
                groupId === "__ungrouped" ? ungrouped : buckets[groupId] || [];
            const groupName =
                groupId === "__ungrouped"
                    ? "Ungrouped"
                    : (dim.groups.find((g) => g.id === groupId)?.name ?? "");

            const gh = placeNodesInGroup(
                members, project, x, cursorY,
                nodeGap, groupPadding, gw,
                fonts, result,
            );

            result.groups[groupId] = {
                x, y: cursorY,
                width: gw, height: gh,
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
    nodeGap: number,
    groupGap: number,
    groupPadding: number,
    fonts: FontConfig,
): LayoutResult {
    const result: LayoutResult = { nodes: {}, groups: {} };

    function groupContentHeight(members: string[]): number {
        if (members.length === 0) return LABEL_H + groupPadding * 2;
        let h = LABEL_H + groupPadding;
        for (const noteId of members) {
            const nw = noteWidth(project, noteId);
            h += estimateNodeHeight(project.notes[noteId].title, project.notes[noteId].short, nw, fonts) + nodeGap;
        }
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
        gw: number;
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
            gw: groupWidthForMembers(members, project, groupPadding),
        });
    }

    if (ungrouped.length) {
        groups.push({
            id: "__ungrouped", name: "Ungrouped", members: ungrouped,
            xIdx: -1, yIdx: -1,
            contentH: groupContentHeight(ungrouped),
            gw: groupWidthForMembers(ungrouped, project, groupPadding),
        });
    }

    const placed = groups.filter((g) => g.xIdx >= 0 && g.yIdx >= 0);
    const unplaced = groups.filter((g) => g.xIdx < 0 || g.yIdx < 0);

    // Compute per-column max width
    const colMaxW = new Array(xStopCount).fill(DEFAULT_NODE_WIDTH + groupPadding * 2);
    for (const g of placed) {
        colMaxW[g.xIdx] = Math.max(colMaxW[g.xIdx], g.gw);
    }

    const grid = new Map<string, GroupInfo[]>();
    for (const g of placed) {
        const key = `${g.xIdx},${g.yIdx}`;
        const list = grid.get(key) || [];
        list.push(g);
        grid.set(key, list);
    }

    const rowMaxH = new Array(yStopCount).fill(LABEL_H + groupPadding * 2);
    for (let r = 0; r < yStopCount; r++) {
        for (let c = 0; c < xStopCount; c++) {
            const cellGroups = grid.get(`${c},${r}`);
            if (!cellGroups || cellGroups.length === 0) continue;
            let totalH = 0;
            for (const cg of cellGroups) totalH += cg.contentH + groupGap;
            totalH -= groupGap;
            rowMaxH[r] = Math.max(rowMaxH[r], totalH);
        }
    }

    const SPECTRUM_MARGIN = 80;

    const colX: number[] = [];
    let cx = SPECTRUM_MARGIN;
    for (let c = 0; c < xStopCount; c++) {
        colX.push(cx);
        cx += colMaxW[c] + groupGap;
    }

    const xExtent = cx - groupGap + SPECTRUM_MARGIN;
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

    const cellCursor = new Map<string, number>();

    for (const g of placed) {
        const cellKey = `${g.xIdx},${g.yIdx}`;
        const cellY = cellCursor.get(cellKey) ?? rowY[g.yIdx];
        const gx = colX[g.xIdx];
        const gw = colMaxW[g.xIdx];

        const gh = placeNodesInGroup(
            g.members, project, gx, cellY,
            nodeGap, groupPadding, gw,
            fonts, result,
        );

        result.groups[g.id] = {
            x: gx, y: cellY,
            width: gw, height: gh,
            name: g.name,
        };

        cellCursor.set(cellKey, cellY + gh + groupGap);
    }

    let unplacedY = yAccum + groupGap;
    let unplacedX = SPECTRUM_MARGIN;
    for (const g of unplaced) {
        const gw = g.gw;
        const gh = placeNodesInGroup(
            g.members, project, unplacedX, unplacedY,
            nodeGap, groupPadding, gw,
            fonts, result,
        );

        result.groups[g.id] = {
            x: unplacedX, y: unplacedY,
            width: gw, height: gh,
            name: g.name,
        };

        unplacedX += gw + groupGap;
        if (unplacedX > xExtent - gw) {
            unplacedX = SPECTRUM_MARGIN;
            unplacedY += gh + groupGap;
        }
    }

    if (xSpec) {
        result.xSpectrum = {
            name: xSpec.name,
            poles: xSpec.poles,
            stops: xSpec.stops.map((name, i) => ({
                name,
                position: colX[i] + colMaxW[i] / 2,
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