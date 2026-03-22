import type { Connection, ProjectData } from "../types";

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

/**
 * Find connected components within a subset of group ids,
 * considering only edges among that subset.
 */
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

/**
 * BFS from the most-connected group (root at column 0).
 *
 * Root's unvisited neighbors are partitioned into connected components
 * among themselves. Components alternate left (col −1) and right (col +1),
 * so groups that share no inter-group connections land on opposite sides
 * of root — lines from root to each side never cross through an unrelated
 * group.
 *
 * Non-root nodes push their unvisited neighbors further outward in the
 * same direction they were placed relative to root.
 */
function computeGroupPlacements(
    adj: Map<string, Set<string>>,
    allGroupIds: string[],
): Map<string, GroupPlacement> {
    const placement = new Map<string, GroupPlacement>();

    // Pick root: highest degree
    let root = allGroupIds[0];
    let maxDeg = -1;
    for (const [id, neighbors] of adj) {
        if (neighbors.size > maxDeg) {
            maxDeg = neighbors.size;
            root = id;
        }
    }

    // No edges at all — line up horizontally
    if (maxDeg <= 0) {
        for (let i = 0; i < allGroupIds.length; i++) {
            placement.set(allGroupIds[i], { col: i, row: 0 });
        }
        return placement;
    }

    const visited = new Set<string>();
    const colRows = new Map<number, number>(); // col → next available row

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
                // Center node: partition neighbors into connected components
                // among themselves, then alternate components left / right.
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
                // Non-center: continue outward in the same direction
                const direction = currentCol > 0 ? 1 : -1;
                for (const id of unvisited) {
                    placeAt(id, currentCol + direction);
                    nextFrontier.push(id);
                }
            }
        }

        frontier = nextFrontier;
    }

    // Unreachable groups (no connections at all) — append after rightmost col
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
    if (!noteIds.length) return result;

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

    // Collect all participating group IDs
    const allGroupIds = dim.groups.map((g) => g.id);
    if (ungrouped.length) allGroupIds.push("__ungrouped");

    // Build adjacency & compute placements
    const connections = project.connections[activeDimensionId] || [];
    const adj = buildGroupAdjacency(
        connections,
        project.notes,
        activeDimensionId,
        new Set(allGroupIds),
    );
    const placements = computeGroupPlacements(adj, allGroupIds);

    // Normalize columns so the leftmost becomes 0
    const minCol = Math.min(...[...placements.values()].map((p) => p.col));
    for (const p of placements.values()) p.col -= minCol;

    // Group placements by column, sorted by row within each
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
        ids.sort(
            (a, b) => placements.get(a)!.row - placements.get(b)!.row,
        );
    }

    // --- Position groups column by column ---
    const sortedCols = [...columns.keys()].sort((a, b) => a - b);

    for (const col of sortedCols) {
        const groupIds = columns.get(col)!;
        const x = col * (groupWidth + groupGap);
        let cursorY = 0;

        for (const groupId of groupIds) {
            const members =
                groupId === "__ungrouped"
                    ? ungrouped
                    : buckets[groupId] || [];
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