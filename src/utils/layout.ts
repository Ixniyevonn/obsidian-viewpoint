import type { ProjectData, Spectrum } from "../types";
import { groupColorVariable } from "./color";
import {
    contiguousGroupRuns,
    groupStopIndices,
    type GroupStopRun,
} from "./groupStops";
import {
    DEFAULT_FONTS,
    measureTextHeight,
    measureTextWidth,
    type FontConfig,
} from "./textMeasure";

import {
    DEFAULT_NODE_WIDTH,
    noteWidth as resolvedNoteWidth,
} from "./nodeWidth";

/**
 * Build a memoized width lookup for one layout pass.
 *
 * The function measures each title with the passed fonts and caches the result
 * during the pass.
 *
 * @param project - The project data with the notes.
 * @param fonts - The title and body font configuration.
 * @returns A function that gives the card width for a note identifier.
 */
function makeWidthOf(
    project: ProjectData,
    fonts: FontConfig,
): (noteId: string) => number {
    const widths = new Map<string, number>();
    return (noteId: string) => {
        let width = widths.get(noteId);
        if (width === undefined) {
            const note = project.notes[noteId];
            width = resolvedNoteWidth(
                note,
                measureTextWidth(note.title, fonts.titleFont),
            );
            widths.set(noteId, width);
        }
        return width;
    };
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
    /** True when one axis of the group has more than one stop. */
    complex: boolean;
    /** The color variable of a complex group. */
    color?: string;
}

/** One background box of a group. A detached stop set gives several boxes. */
export interface GroupBoxLayout {
    groupId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    name: string;
    color?: string;
}

export interface LayoutResult {
    nodes: Record<string, NodeLayout>;
    groups: Record<string, GroupLayout>;
    groupBoxes: GroupBoxLayout[];
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
    /** Actual measured DOM heights keyed by noteId. Overrides estimation. */
    measuredHeights?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Node height estimation
// ---------------------------------------------------------------------------

const NODE_PAD_TOP = 8;
const NODE_PAD_MID = 8;
const NODE_PAD_BOTTOM = 16;
const NODE_MIN_H = 64;

function estimateNodeHeight(
    title: string,
    short: string,
    nw: number,
    fonts: FontConfig,
): number {
    const contentWidth = nw - 32;
    const titleH = measureTextHeight(
        title,
        fonts.titleFont,
        contentWidth,
        fonts.titleLineHeight,
    ).height;

    let bodyH = 0;
    if (short) {
        bodyH = measureTextHeight(
            short,
            fonts.bodyFont,
            contentWidth,
            fonts.bodyLineHeight,
        ).height;
    }

    const total =
        NODE_PAD_TOP +
        titleH +
        (short ? NODE_PAD_MID + bodyH : 0) +
        NODE_PAD_BOTTOM;
    return Math.max(NODE_MIN_H, total);
}

// ---------------------------------------------------------------------------
// Group adjacency / BFS
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
    widthOf: (id: string) => number,
    groupPadding: number,
): number {
    let maxNw = DEFAULT_NODE_WIDTH;
    for (const id of members) {
        maxNw = Math.max(maxNw, widthOf(id));
    }
    return maxNw + groupPadding * 2;
}

// ---------------------------------------------------------------------------
// Helper: place nodes inside a group
// ---------------------------------------------------------------------------

const LABEL_H = 40;

function placeNodesInGroup(
    members: string[],
    gx: number,
    gy: number,
    nodeGap: number,
    groupPadding: number,
    groupWidth: number,
    heightOf: (id: string) => number,
    widthOf: (id: string) => number,
    result: LayoutResult,
): number {
    if (members.length === 0) {
        return LABEL_H + groupPadding * 2;
    }

    const startY = gy + LABEL_H + groupPadding;
    let cursorY = startY;

    for (const noteId of members) {
        const nw = widthOf(noteId);
        const h = heightOf(noteId);
        result.nodes[noteId] = {
            x: gx + groupPadding,
            y: cursorY,
            width: nw,
            height: h,
        };
        cursorY += h + nodeGap;
    }

    const groupHeight = cursorY - nodeGap - gy + groupPadding;
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
        measuredHeights = {},
    } = options;

    const result: LayoutResult = { nodes: {}, groups: {}, groupBoxes: [] };
    const noteIds = Object.keys(project.notes);
    const widthOf = makeWidthOf(project, fonts);

    /** Use measured DOM height if available, otherwise estimate via pretext */
    function heightOf(id: string): number {
        if (measuredHeights[id] !== undefined) return measuredHeights[id];
        const note = project.notes[id];
        const nw = widthOf(id);
        return estimateNodeHeight(note.title, note.short, nw, fonts);
    }

    const dim = activeDimensionId ? project.dimensions[activeDimensionId] : null;

    // No dimension — flat grid fallback
    if (!dim || !activeDimensionId) {
        const colHeights = new Array(gridColumns).fill(0);
        const columnWidth = Math.max(200, ...noteIds.map((id) => widthOf(id)));
        for (let i = 0; i < noteIds.length; i++) {
            let col = 0;
            for (let c = 1; c < gridColumns; c++) {
                if (colHeights[c] < colHeights[col]) col = c;
            }
            const nw = widthOf(noteIds[i]);
            const h = heightOf(noteIds[i]);
            result.nodes[noteIds[i]] = {
                x: col * (columnWidth + nodeGap),
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
            project,
            activeDimensionId,
            dim,
            buckets,
            ungrouped,
            xSpec ?? null,
            ySpec ?? null,
            nodeGap,
            groupGap,
            groupPadding,
            fonts,
            widthOf,
            measuredHeights,
        );
    }

    // ======================================================================
    // BFS ADJACENCY LAYOUT (no spectra)
    // ======================================================================
    const allGroupIds = dim.groups.map((g) => g.id);
    if (ungrouped.length) allGroupIds.push("__ungrouped");

    const connections = getConnectionsForDimension(project, activeDimensionId);
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

    // Find widest group in each column
    const colMaxWidth = new Map<number, number>();
    for (const [col, groupIds] of columns) {
        let maxW = DEFAULT_NODE_WIDTH + groupPadding * 2;
        for (const gid of groupIds) {
            const members = gid === "__ungrouped" ? ungrouped : buckets[gid] || [];
            maxW = Math.max(
                maxW,
                groupWidthForMembers(members, widthOf, groupPadding),
            );
        }
        colMaxWidth.set(col, maxW);
    }

    const sortedCols = [...columns.keys()].sort((a, b) => a - b);

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
                members,
                x,
                cursorY,
                nodeGap,
                groupPadding,
                gw,
                heightOf,
                widthOf,
                result,
            );

            result.groups[groupId] = {
                x,
                y: cursorY,
                width: gw,
                height: gh,
                name: groupName,
                complex: false,
            };
            result.groupBoxes.push({
                groupId,
                x,
                y: cursorY,
                width: gw,
                height: gh,
                name: groupName,
            });

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
    widthOf: (id: string) => number,
    measuredHeights: Record<string, number>,
): LayoutResult {
    const result: LayoutResult = { nodes: {}, groups: {}, groupBoxes: [] };

    function heightOf(id: string): number {
        if (measuredHeights[id] !== undefined) return measuredHeights[id];
        const note = project.notes[id];
        const nw = widthOf(id);
        return estimateNodeHeight(note.title, note.short, nw, fonts);
    }

    function placeCellNodes(members: string[], x: number, startY: number): void {
        let cursor = startY;
        for (const id of members) {
            const nw = widthOf(id);
            const h = heightOf(id);
            result.nodes[id] = { x, y: cursor, width: nw, height: h };
            cursor += h + nodeGap;
        }
    }

    const xStops = xSpec ? xSpec.stops : null;
    const yStops = ySpec ? ySpec.stops : null;
    const xStopCount = xStops ? xStops.length : 1;
    const yStopCount = yStops ? yStops.length : 1;

    interface ResolvedGroup {
        id: string;
        name: string;
        members: string[];
        xIndices: number[];
        yIndices: number[];
        xRuns: GroupStopRun[];
        yRuns: GroupStopRun[];
        placed: boolean;
        complex: boolean;
        color?: string;
        cells: Map<string, string[]>;
    }

    // Resolve each group to stop runs and to per-cell member lists.
    const resolved: ResolvedGroup[] = [];
    for (const g of dim.groups) {
        const members = buckets[g.id] || [];
        const xIndices = xSpec ? groupStopIndices(g.x, xStops) : [0];
        const yIndices = ySpec ? groupStopIndices(g.y, yStops) : [0];
        const placed =
            (xSpec ? xIndices.length > 0 : true) &&
            (ySpec ? yIndices.length > 0 : true);
        const complex = xIndices.length > 1 || yIndices.length > 1;
        const cells = new Map<string, string[]>();
        if (placed) {
            for (const noteId of members) {
                const placement = project.notes[noteId]?.placement?.[dimId];
                let xi = xIndices[0];
                let yi = yIndices[0];
                if (xSpec && xStops) {
                    const idx = placement?.x ? xStops.indexOf(placement.x) : -1;
                    xi = xIndices.includes(idx) ? idx : xIndices[0];
                }
                if (ySpec && yStops) {
                    const idx = placement?.y ? yStops.indexOf(placement.y) : -1;
                    yi = yIndices.includes(idx) ? idx : yIndices[0];
                }
                const key = `${xi},${yi}`;
                const list = cells.get(key) ?? [];
                list.push(noteId);
                cells.set(key, list);
            }
        }
        resolved.push({
            id: g.id,
            name: g.name,
            members,
            xIndices,
            yIndices,
            xRuns: contiguousGroupRuns(xIndices),
            yRuns: contiguousGroupRuns(yIndices),
            placed,
            complex,
            color: complex ? groupColorVariable(g.id) : undefined,
            cells,
        });
    }

    if (ungrouped.length) {
        resolved.push({
            id: "__ungrouped",
            name: "Ungrouped",
            members: ungrouped,
            xIndices: [],
            yIndices: [],
            xRuns: [],
            yRuns: [],
            placed: false,
            complex: false,
            cells: new Map(),
        });
    }

    // Vertical packing. A single-row box stacks in its columns. A Y span
    // claims its cells and stays exclusive.
    const blockedCells = new Set<string>();
    const rowCursor = new Map<string, number>();
    const singleOffset = new Map<string, number>();

    function cellMembers(group: ResolvedGroup, c: number, r: number): string[] {
        return group.cells.get(`${c},${r}`) ?? [];
    }
    function cellStackHeight(members: string[]): number {
        if (members.length === 0) return 0;
        let total = 0;
        for (const id of members) total += heightOf(id) + nodeGap;
        return total - nodeGap;
    }
    function boxContentHeight(
        group: ResolvedGroup,
        xr: GroupStopRun,
        row: number,
    ): number {
        let top = 0;
        for (let c = xr.from; c <= xr.to; c++) {
            top = Math.max(top, cellStackHeight(cellMembers(group, c, row)));
        }
        return LABEL_H + groupPadding * 2 + top;
    }

    for (const group of resolved) {
        if (!group.placed) continue;
        if (group.yIndices.length <= 1) {
            const row = group.yIndices[0] ?? 0;
            let conflict = false;
            for (const xr of group.xRuns) {
                for (let c = xr.from; c <= xr.to; c++) {
                    if (blockedCells.has(`${row},${c}`)) conflict = true;
                }
            }
            if (conflict) {
                group.placed = false;
                continue;
            }
            for (const xr of group.xRuns) {
                const height = boxContentHeight(group, xr, row);
                let offset = 0;
                for (let c = xr.from; c <= xr.to; c++) {
                    offset = Math.max(offset, rowCursor.get(`${row},${c}`) ?? 0);
                }
                singleOffset.set(`${group.id}:${xr.from}`, offset);
                const bottom = offset + height + groupGap;
                for (let c = xr.from; c <= xr.to; c++) {
                    rowCursor.set(
                        `${row},${c}`,
                        Math.max(rowCursor.get(`${row},${c}`) ?? 0, bottom),
                    );
                }
            }
        } else {
            const c = group.xIndices[0];
            let conflict = false;
            for (const yr of group.yRuns) {
                for (let r = yr.from; r <= yr.to; r++) {
                    if (
                        blockedCells.has(`${r},${c}`) ||
                        (rowCursor.get(`${r},${c}`) ?? 0) > 0
                    ) {
                        conflict = true;
                    }
                }
            }
            if (conflict) {
                group.placed = false;
                continue;
            }
            for (const yr of group.yRuns) {
                for (let r = yr.from; r <= yr.to; r++) {
                    blockedCells.add(`${r},${c}`);
                }
            }
        }
    }

    const placedGroups = resolved.filter((g) => g.placed);
    const unplacedGroups = resolved.filter((g) => !g.placed);

    const colW = new Array(xStopCount).fill(
        DEFAULT_NODE_WIDTH + groupPadding * 2,
    );
    for (const group of placedGroups) {
        for (const [key, members] of group.cells) {
            const c = Number(key.split(",")[0]);
            let width = DEFAULT_NODE_WIDTH;
            for (const id of members) width = Math.max(width, widthOf(id));
            colW[c] = Math.max(colW[c], width + groupPadding * 2);
        }
    }

    const rowH = new Array(yStopCount).fill(LABEL_H + groupPadding * 2);
    for (const [key, bottom] of rowCursor) {
        const r = Number(key.split(",")[0]);
        rowH[r] = Math.max(rowH[r], bottom - groupGap);
    }
    for (const group of placedGroups) {
        if (group.yIndices.length <= 1) continue;
        const c = group.xIndices[0];
        for (const yr of group.yRuns) {
            for (let r = yr.from; r <= yr.to; r++) {
                rowH[r] = Math.max(
                    rowH[r],
                    cellStackHeight(cellMembers(group, c, r)) + groupPadding * 2,
                );
            }
            const topStack = cellStackHeight(cellMembers(group, c, yr.from));
            rowH[yr.from] = Math.max(
                rowH[yr.from],
                LABEL_H + groupPadding + topStack + groupPadding,
            );
        }
    }

    const SPECTRUM_MARGIN = 80;

    const colX: number[] = [];
    let cx = SPECTRUM_MARGIN;
    for (let c = 0; c < xStopCount; c++) {
        colX.push(cx);
        cx += colW[c] + groupGap;
    }

    const xExtent = cx - groupGap + SPECTRUM_MARGIN;
    const totalRowH =
        rowH.reduce((a, b) => a + b, 0) + (yStopCount - 1) * groupGap;
    const yExtent = Math.max(
        totalRowH + SPECTRUM_MARGIN * 2,
        LABEL_H + groupPadding * 2 + SPECTRUM_MARGIN * 2,
    );

    const rowY: number[] = [];
    let yAccum = SPECTRUM_MARGIN;
    for (let r = 0; r < yStopCount; r++) {
        rowY.push(yAccum);
        yAccum += rowH[r] + groupGap;
    }

    for (const group of placedGroups) {
        let primary: GroupBoxLayout | null = null;

        if (group.yIndices.length <= 1) {
            const row = group.yIndices[0] ?? 0;
            for (const xr of group.xRuns) {
                const offset = singleOffset.get(`${group.id}:${xr.from}`) ?? 0;
                const height = boxContentHeight(group, xr, row);
                const box: GroupBoxLayout = {
                    groupId: group.id,
                    name: group.name,
                    color: group.color,
                    x: colX[xr.from],
                    y: rowY[row] + offset,
                    width: colX[xr.to] + colW[xr.to] - colX[xr.from],
                    height,
                };
                result.groupBoxes.push(box);
                if (!primary) primary = box;
                for (let c = xr.from; c <= xr.to; c++) {
                    const members = cellMembers(group, c, row);
                    if (members.length === 0) continue;
                    placeCellNodes(
                        members,
                        colX[c] + groupPadding,
                        box.y + LABEL_H + groupPadding,
                    );
                }
            }
        } else {
            const c = group.xIndices[0];
            for (const yr of group.yRuns) {
                const box: GroupBoxLayout = {
                    groupId: group.id,
                    name: group.name,
                    color: group.color,
                    x: colX[c],
                    y: rowY[yr.from],
                    width: colW[c],
                    height: rowY[yr.to] + rowH[yr.to] - rowY[yr.from],
                };
                result.groupBoxes.push(box);
                if (!primary) primary = box;
                for (let r = yr.from; r <= yr.to; r++) {
                    const members = cellMembers(group, c, r);
                    if (members.length === 0) continue;
                    const startY =
                        rowY[r] +
                        (r === yr.from ? LABEL_H + groupPadding : groupPadding);
                    placeCellNodes(members, colX[c] + groupPadding, startY);
                }
            }
        }

        if (primary) {
            result.groups[group.id] = {
                x: primary.x,
                y: primary.y,
                width: primary.width,
                height: primary.height,
                name: group.name,
                complex: group.complex,
                color: group.color,
            };
        }
    }

    let unplacedY = yAccum + groupGap;
    let unplacedX = SPECTRUM_MARGIN;
    for (const group of unplacedGroups) {
        const gw = groupWidthForMembers(group.members, widthOf, groupPadding);
        const gh = placeNodesInGroup(
            group.members,
            unplacedX,
            unplacedY,
            nodeGap,
            groupPadding,
            gw,
            heightOf,
            widthOf,
            result,
        );

        result.groups[group.id] = {
            x: unplacedX,
            y: unplacedY,
            width: gw,
            height: gh,
            name: group.name,
            complex: false,
        };
        result.groupBoxes.push({
            groupId: group.id,
            x: unplacedX,
            y: unplacedY,
            width: gw,
            height: gh,
            name: group.name,
        });

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
                position: colX[i] + colW[i] / 2,
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
                position: rowY[i] + rowH[i] / 2,
            })),
            extent: yExtent,
        };
    }

    return result;
}
