import type { GroupCell, Note, ProjectData } from "../types";

/** One stop index pair. A null axis of a cell becomes index 0. */
export interface CellIndex {
    xi: number;
    yi: number;
}

/** A box of a group: a cell run along one axis. */
export interface GroupRun {
    xFrom: number;
    xTo: number;
    yFrom: number;
    yTo: number;
    cells: CellIndex[];
}

/** Return a stable key for a cell. */
export function cellKey(cell: GroupCell): string {
    return `${cell.x ?? "\u0001"}\u0000${cell.y ?? "\u0001"}`;
}

/** Return a stable key for an index cell. */
export function indexKey(cell: CellIndex): string {
    return `${cell.xi},${cell.yi}`;
}

/** Return true when a run contains an index cell. */
export function runContains(run: GroupRun, xi: number, yi: number): boolean {
    return run.cells.some((cell) => cell.xi === xi && cell.yi === yi);
}

/**
 * Clean one group cell against the spectra.
 *
 * @param cell - The raw cell.
 * @param xStops - The X stop names, or null.
 * @param yStops - The Y stop names, or null.
 * @returns The clean cell, or null when the cell is not valid.
 */
export function normalizeGroupCell(
    cell: GroupCell,
    xStops: string[] | null | undefined,
    yStops: string[] | null | undefined,
): GroupCell | null {
    if (!xStops && !yStops) return null;
    let x = cell.x ?? null;
    let y = cell.y ?? null;
    if (xStops) {
        if (x === null || !xStops.includes(x)) return null;
    } else {
        x = null;
    }
    if (yStops) {
        if (y === null || !yStops.includes(y)) return null;
    } else {
        y = null;
    }
    return { x, y };
}

/**
 * Clean a group cell list.
 *
 * @param cells - The raw cells.
 * @param xStops - The X stop names, or null.
 * @param yStops - The Y stop names, or null.
 * @returns The clean cells, with invalid cells and duplicates removed.
 */
export function normalizeGroupCells(
    cells: GroupCell[] | null | undefined,
    xStops: string[] | null | undefined,
    yStops: string[] | null | undefined,
): GroupCell[] {
    if (!Array.isArray(cells)) return [];
    const seen = new Set<string>();
    const result: GroupCell[] = [];
    for (const cell of cells) {
        const clean = normalizeGroupCell(cell, xStops, yStops);
        if (!clean) continue;
        const key = cellKey(clean);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(clean);
    }
    return result;
}

/** Convert cells to stop indices. */
export function cellsToIndices(
    cells: GroupCell[],
    xStops: string[] | null | undefined,
    yStops: string[] | null | undefined,
): CellIndex[] {
    const result: CellIndex[] = [];
    for (const cell of cells) {
        const xi = xStops ? xStops.indexOf(cell.x ?? "") : 0;
        const yi = yStops ? yStops.indexOf(cell.y ?? "") : 0;
        if (xStops && xi < 0) continue;
        if (yStops && yi < 0) continue;
        result.push({ xi, yi });
    }
    return dedupeIndices(result);
}

/** Convert stop indices to cells. */
export function indicesToCells(
    indices: CellIndex[],
    xStops: string[] | null | undefined,
    yStops: string[] | null | undefined,
): GroupCell[] {
    const cells: GroupCell[] = [];
    for (const cell of dedupeIndices(indices)) {
        cells.push({
            x: xStops ? (xStops[cell.xi] ?? null) : null,
            y: yStops ? (yStops[cell.yi] ?? null) : null,
        });
    }
    return cells;
}

/** Remove duplicate index cells. */
export function dedupeIndices(indices: CellIndex[]): CellIndex[] {
    const seen = new Set<string>();
    const result: CellIndex[] = [];
    for (const cell of indices) {
        const key = indexKey(cell);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(cell);
    }
    return result;
}

/**
 * Split index cells into one-axis runs.
 *
 * The function walks the cells in row-major order. A cell with a horizontal
 * neighbor starts a horizontal run. A cell without one starts a vertical run.
 *
 * @param indices - The index cells.
 * @returns The runs. Each cell belongs to exactly one run.
 */
export function decomposeGroupRuns(indices: CellIndex[]): GroupRun[] {
    const cells = dedupeIndices(indices);
    const present = new Set(cells.map(indexKey));
    const visited = new Set<string>();
    const has = (xi: number, yi: number) => present.has(`${xi},${yi}`);
    const free = (xi: number, yi: number) =>
        has(xi, yi) && !visited.has(`${xi},${yi}`);
    const sorted = [...cells].sort((a, b) => a.yi - b.yi || a.xi - b.xi);
    const runs: GroupRun[] = [];

    for (const start of sorted) {
        if (visited.has(indexKey(start))) continue;

        let xTo = start.xi;
        while (free(xTo + 1, start.yi)) xTo++;
        let xFrom = start.xi;
        while (free(xFrom - 1, start.yi)) xFrom--;

        if (xTo > xFrom) {
            const runCells: CellIndex[] = [];
            for (let x = xFrom; x <= xTo; x++) {
                runCells.push({ xi: x, yi: start.yi });
                visited.add(`${x},${start.yi}`);
            }
            runs.push({
                xFrom,
                xTo,
                yFrom: start.yi,
                yTo: start.yi,
                cells: runCells,
            });
            continue;
        }

        let yTo = start.yi;
        while (free(start.xi, yTo + 1)) yTo++;
        let yFrom = start.yi;
        while (free(start.xi, yFrom - 1)) yFrom--;
        const runCells: CellIndex[] = [];
        for (let y = yFrom; y <= yTo; y++) {
            runCells.push({ xi: start.xi, yi: y });
            visited.add(`${start.xi},${y}`);
        }
        runs.push({ xFrom: start.xi, xTo: start.xi, yFrom, yTo, cells: runCells });
    }

    return runs;
}

/** Move one run by a stop delta. Other cells stay. */
export function shiftRunCells(
    indices: CellIndex[],
    run: GroupRun,
    dx: number,
    dy: number,
    xCount: number,
    yCount: number,
): CellIndex[] {
    const runKeys = new Set(run.cells.map(indexKey));
    const others = dedupeIndices(indices).filter(
        (cell) => !runKeys.has(indexKey(cell)),
    );
    let minDx = -Infinity;
    let maxDx = Infinity;
    let minDy = -Infinity;
    let maxDy = Infinity;
    for (const cell of run.cells) {
        minDx = Math.max(minDx, -cell.xi);
        maxDx = Math.min(maxDx, xCount - 1 - cell.xi);
        minDy = Math.max(minDy, -cell.yi);
        maxDy = Math.min(maxDy, yCount - 1 - cell.yi);
    }
    const adx = Math.max(minDx, Math.min(maxDx, dx));
    const ady = Math.max(minDy, Math.min(maxDy, dy));
    const moved = run.cells.map((cell) => ({
        xi: cell.xi + adx,
        yi: cell.yi + ady,
    }));
    return dedupeIndices([...others, ...moved]);
}

/** Resize one run along one axis. Other cells stay. */
export function resizeRunCells(
    indices: CellIndex[],
    run: GroupRun,
    axis: "x" | "y",
    edge: "min" | "max",
    targetIndex: number,
): CellIndex[] {
    const runKeys = new Set(run.cells.map(indexKey));
    const others = dedupeIndices(indices).filter(
        (cell) => !runKeys.has(indexKey(cell)),
    );
    const fixed = axis === "x"
        ? edge === "min"
            ? run.xTo
            : run.xFrom
        : edge === "min"
          ? run.yTo
          : run.yFrom;
    const low = Math.min(fixed, targetIndex);
    const high = Math.max(fixed, targetIndex);
    const added: CellIndex[] = [];
    if (axis === "x") {
        for (let x = low; x <= high; x++) added.push({ xi: x, yi: run.yFrom });
    } else {
        for (let y = low; y <= high; y++) added.push({ xi: run.xFrom, yi: y });
    }
    return dedupeIndices([...others, ...added]);
}

/** Remove one run from the cell list. */
export function removeRunCells(
    indices: CellIndex[],
    run: GroupRun,
): CellIndex[] {
    const runKeys = new Set(run.cells.map(indexKey));
    return dedupeIndices(indices).filter((cell) => !runKeys.has(indexKey(cell)));
}

/** Add one cell to the cell list. */
export function addCellIndex(
    indices: CellIndex[],
    xi: number,
    yi: number,
): CellIndex[] {
    return dedupeIndices([...indices, { xi, yi }]);
}

/**
 * Rename or drop the stop of a note placement on one axis.
 *
 * @param note - The note to change.
 * @param dimensionId - The dimension of the group.
 * @param axis - The spectrum axis.
 * @param rename - A map from an old stop name to its new name.
 * @param valid - The stop names of the new spectrum.
 */
export function remapNotePlacement(
    note: Note,
    dimensionId: string,
    axis: "x" | "y",
    rename: Map<string, string>,
    valid: Set<string> | null,
): void {
    const placement = note.placement?.[dimensionId];
    const current = placement?.[axis];
    if (!current) return;
    if (!valid) {
        delete placement[axis];
        return;
    }
    const changed = rename.get(current) ?? current;
    if (valid.has(changed)) placement[axis] = changed;
    else delete placement[axis];
}

/**
 * Rename or drop the stops of a group cell list.
 *
 * @param cells - The group cells.
 * @param xRename - A map from an old X stop to its new name.
 * @param yRename - A map from an old Y stop to its new name.
 * @param xValid - The new X stops, or null.
 * @param yValid - The new Y stops, or null.
 * @returns The changed cells.
 */
export function remapGroupCells(
    cells: GroupCell[],
    xRename: Map<string, string>,
    yRename: Map<string, string>,
    xValid: Set<string> | null,
    yValid: Set<string> | null,
): GroupCell[] {
    const result: GroupCell[] = [];
    for (const cell of cells) {
        let x = cell.x ? (xRename.get(cell.x) ?? cell.x) : null;
        let y = cell.y ? (yRename.get(cell.y) ?? cell.y) : null;
        if (!xValid) x = null;
        else if (!x || !xValid.has(x)) continue;
        if (!yValid) y = null;
        else if (!y || !yValid.has(y)) continue;
        result.push({ x, y });
    }
    return result;
}

/** Return the group cell nearest to a wanted stop pair. */
export function nearestGroupCell(
    cells: GroupCell[],
    xStop: string | null,
    yStop: string | null,
    xStops: string[] | null | undefined,
    yStops: string[] | null | undefined,
): GroupCell {
    const wantedX = xStops ? xStops.indexOf(xStop ?? "") : 0;
    const wantedY = yStops ? yStops.indexOf(yStop ?? "") : 0;
    let best = cells[0];
    let bestDistance = Infinity;
    for (const cell of cells) {
        const xi = xStops ? xStops.indexOf(cell.x ?? "") : 0;
        const yi = yStops ? yStops.indexOf(cell.y ?? "") : 0;
        const distance =
            Math.abs(xi - wantedX) + Math.abs(yi - wantedY);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = cell;
        }
    }
    return best;
}

/**
 * Remove the placement of a note in one dimension.
 *
 * @param note - The note to change.
 * @param dimensionId - The dimension to clear.
 */
export function clearNotePlacement(note: Note, dimensionId: string): void {
    if (!note.placement) return;
    delete note.placement[dimensionId];
    if (Object.keys(note.placement).length === 0) delete note.placement;
}

/**
 * Place a note at the cell of its group nearest to a wanted pair.
 *
 * The function stores an axis only when the group varies on that axis.
 *
 * @param note - The note to change.
 * @param dimensionId - The dimension of the group.
 * @param cells - The group cells.
 * @param xStop - The wanted X stop, or null.
 * @param yStop - The wanted Y stop, or null.
 * @param xStops - The X stop names, or null.
 * @param yStops - The Y stop names, or null.
 */
export function placeNoteInGroup(
    note: Note,
    dimensionId: string,
    cells: GroupCell[],
    xStop: string | null,
    yStop: string | null,
    xStops: string[] | null | undefined,
    yStops: string[] | null | undefined,
): void {
    const clean = normalizeGroupCells(cells, xStops, yStops);
    if (clean.length === 0) {
        clearNotePlacement(note, dimensionId);
        return;
    }
    const target = nearestGroupCell(clean, xStop, yStop, xStops, yStops);
    writePlacement(note, dimensionId, clean, target, xStops, yStops);
}

/** Clean the placement of one note against its group cells. */
export function normalizeNotePlacement(
    note: Note,
    dimensionId: string,
    cells: GroupCell[],
    xStops: string[] | null | undefined,
    yStops: string[] | null | undefined,
): void {
    const placement = note.placement?.[dimensionId];
    if (!placement) return;
    const clean = normalizeGroupCells(cells, xStops, yStops);
    if (clean.length === 0) {
        clearNotePlacement(note, dimensionId);
        return;
    }
    const target = nearestGroupCell(
        clean,
        placement.x ?? null,
        placement.y ?? null,
        xStops,
        yStops,
    );
    writePlacement(note, dimensionId, clean, target, xStops, yStops);
}

/** Store a placement, keeping only the axes that vary. */
function writePlacement(
    note: Note,
    dimensionId: string,
    cells: GroupCell[],
    target: GroupCell,
    xStops: string[] | null | undefined,
    yStops: string[] | null | undefined,
): void {
    if (cells.length <= 1) {
        clearNotePlacement(note, dimensionId);
        return;
    }
    setNotePlacementCell(note, dimensionId, target, xStops, yStops);
}

/**
 * Store a note cell placement.
 *
 * The function keeps every axis that has a spectrum. A missing axis later falls
 * back to the group cell, so a merge does not move the note.
 *
 * @param note - The note to change.
 * @param dimensionId - The dimension of the group.
 * @param cell - The cell stop names.
 * @param xStops - The X stop names, or null.
 * @param yStops - The Y stop names, or null.
 */
export function setNotePlacementCell(
    note: Note,
    dimensionId: string,
    cell: GroupCell,
    xStops: string[] | null | undefined,
    yStops: string[] | null | undefined,
): void {
    const next: { x?: string; y?: string } = {};
    if (xStops && cell.x) next.x = cell.x;
    if (yStops && cell.y) next.y = cell.y;
    if (!next.x && !next.y) {
        clearNotePlacement(note, dimensionId);
        return;
    }
    if (!note.placement) note.placement = {};
    note.placement[dimensionId] = next;
}

/** Return the index cell nearest to a wanted index cell. */
export function nearestCellIndex(
    indices: CellIndex[],
    wanted: CellIndex,
): CellIndex {
    let best = indices[0];
    let bestDistance = Infinity;
    for (const cell of indices) {
        const distance =
            Math.abs(cell.xi - wanted.xi) + Math.abs(cell.yi - wanted.yi);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = cell;
        }
    }
    return best;
}

/**
 * Return the index cell that a note currently uses.
 *
 * A missing placement axis falls back to the first group cell. This keeps a
 * note in place when the group gains or merges cells.
 *
 * @param placement - The note placement, or null.
 * @param indices - The group index cells.
 * @param xStops - The X stop names, or null.
 * @param yStops - The Y stop names, or null.
 * @returns The nearest group cell, or null when the group has no cells.
 */
export function effectiveCellIndex(
    placement: { x?: string; y?: string } | null | undefined,
    indices: CellIndex[],
    xStops: string[] | null | undefined,
    yStops: string[] | null | undefined,
): CellIndex | null {
    if (indices.length === 0) return null;
    const fallback = indices[0];
    const xIndex = xStops && placement?.x ? xStops.indexOf(placement.x) : -1;
    const yIndex = yStops && placement?.y ? yStops.indexOf(placement.y) : -1;
    const wanted: CellIndex = {
        xi: xIndex >= 0 ? xIndex : fallback.xi,
        yi: yIndex >= 0 ? yIndex : fallback.yi,
    };
    return nearestCellIndex(indices, wanted);
}

/**
 * Clean the groups and placements of one dimension.
 *
 * @param project - The project to change.
 * @param dimensionId - The dimension to clean.
 */
export function normalizeDimensionCells(
    project: ProjectData,
    dimensionId: string,
): void {
    const dim = project.dimensions[dimensionId];
    if (!dim) return;
    const xStops = dim["x-spectrum"]?.stops ?? null;
    const yStops = dim["y-spectrum"]?.stops ?? null;
    for (const group of dim.groups) {
        group.cells = normalizeGroupCells(group.cells, xStops, yStops);
    }
    for (const note of Object.values(project.notes)) {
        const groupId = note.membership?.[dimensionId];
        const group = groupId
            ? dim.groups.find((item) => item.id === groupId)
            : undefined;
        if (!group) {
            clearNotePlacement(note, dimensionId);
        } else {
            normalizeNotePlacement(note, dimensionId, group.cells, xStops, yStops);
        }
    }
}

/**
 * Clean the groups and placements of every dimension.
 *
 * @param project - The project to change.
 */
export function normalizeProjectCells(project: ProjectData): void {
    for (const dimensionId of Object.keys(project.dimensions)) {
        normalizeDimensionCells(project, dimensionId);
    }
}
