import type { Group, GroupStopSet, Note, ProjectData } from "../types";

/** A contiguous run of stop indices, inclusive. */
export interface GroupStopRun {
    from: number;
    to: number;
}

/**
 * Return the sorted stop indices for a group axis value.
 *
 * The function reads a stop name or a stop list. It keeps known stops only,
 * removes duplicates, and sorts the result by spectrum order.
 *
 * @param value - The group axis value.
 * @param stops - The stop names of the spectrum, or null when the axis has no spectrum.
 * @returns The sorted stop indices. The result is empty when the axis has no spectrum.
 */
export function groupStopIndices(
    value: GroupStopSet | null | undefined,
    stops: string[] | null | undefined,
): number[] {
    if (!value || !stops || stops.length === 0) return [];
    const names = typeof value === "string" ? [value] : value;
    const index = new Map<string, number>();
    stops.forEach((name, i) => {
        index.set(name, i);
    });
    const result = new Set<number>();
    for (const name of names) {
        const i = index.get(name);
        if (i !== undefined) result.add(i);
    }
    return [...result].sort((a, b) => a - b);
}

/**
 * Build a group axis value from stop indices.
 *
 * The function keeps indices in range, removes duplicates, and sorts them. One
 * index gives a stop name. Two or more indices give a stop list.
 *
 * @param indices - The stop indices.
 * @param stops - The stop names of the spectrum.
 * @returns The axis value, or null when no index is valid.
 */
export function groupStopSetFromIndices(
    indices: number[],
    stops: string[] | null | undefined,
): GroupStopSet | null {
    if (!stops || stops.length === 0) return null;
    const sorted = [...new Set(indices)]
        .filter((i) => i >= 0 && i < stops.length)
        .sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    if (sorted.length === 1) return stops[sorted[0]];
    return sorted.map((i) => stops[i]);
}

/**
 * Return a clean axis value for a spectrum.
 *
 * The function removes unknown stops, duplicates, and order differences. It
 * returns null when the axis has no spectrum or no known stop.
 *
 * @param value - The raw axis value.
 * @param stops - The stop names of the spectrum.
 * @returns The clean axis value, or null.
 */
export function normalizeGroupStopSet(
    value: GroupStopSet | null | undefined,
    stops: string[] | null | undefined,
): GroupStopSet | null {
    if (!stops || stops.length === 0) return null;
    return groupStopSetFromIndices(groupStopIndices(value, stops), stops);
}

/**
 * Return the number of stops in an axis value.
 *
 * @param value - The axis value.
 * @param stops - The stop names of the spectrum.
 * @returns The count of known stops.
 */
export function groupStopCount(
    value: GroupStopSet | null | undefined,
    stops: string[] | null | undefined,
): number {
    return groupStopIndices(value, stops).length;
}

/**
 * Split sorted stop indices into contiguous runs.
 *
 * @param indices - The sorted stop indices.
 * @returns The contiguous runs, inclusive.
 */
export function contiguousGroupRuns(indices: number[]): GroupStopRun[] {
    const runs: GroupStopRun[] = [];
    for (const i of indices) {
        const last = runs[runs.length - 1];
        if (last && i === last.to + 1) last.to = i;
        else runs.push({ from: i, to: i });
    }
    return runs;
}

/**
 * Return the allowed index nearest to a target index.
 *
 * @param index - The target index.
 * @param allowed - The allowed indices, sorted.
 * @returns The nearest allowed index, or -1 when none is allowed. A tie goes to the earlier index.
 */
export function nearestStopIndex(index: number, allowed: number[]): number {
    if (allowed.length === 0) return -1;
    let best = allowed[0];
    let bestDist = Math.abs(allowed[0] - index);
    for (const a of allowed) {
        const d = Math.abs(a - index);
        if (d < bestDist) {
            best = a;
            bestDist = d;
        }
    }
    return best;
}

/**
 * Toggle a contiguous run of stops in an axis value.
 *
 * The function adds the run when it is not fully present. It removes the run
 * when it is fully present. Adjacent runs merge on their own. A toggle keeps at
 * least one stop, so a group never loses its position. When a removal would
 * empty the set, the function keeps the end stop of the run.
 *
 * @param value - The current axis value.
 * @param stops - The stop names of the spectrum.
 * @param fromIndex - One end index of the run.
 * @param toIndex - The other end index of the run.
 * @returns The new axis value.
 */
export function toggleGroupStopRun(
    value: GroupStopSet | null | undefined,
    stops: string[] | null | undefined,
    fromIndex: number,
    toIndex: number,
): GroupStopSet | null {
    if (!stops) return null;
    const current = groupStopIndices(value, stops);
    const low = Math.min(fromIndex, toIndex);
    const high = Math.max(fromIndex, toIndex);
    const run: number[] = [];
    for (let i = low; i <= high; i++) run.push(i);
    const fullyPresent = run.every((i) => current.includes(i));
    const next = fullyPresent
        ? current.filter((i) => i < low || i > high)
        : [...new Set([...current, ...run])];
    // Keep one stop. A group must not lose its position from a toggle.
    if (next.length === 0) {
        return groupStopSetFromIndices([toIndex], stops);
    }
    return groupStopSetFromIndices(next, stops);
}

/**
 * Move a stop set by the distance between two stops.
 *
 * The function keeps the span length. It clamps the move at the spectrum ends.
 *
 * @param value - The current axis value.
 * @param stops - The stop names of the spectrum.
 * @param fromStop - The stop where the move starts.
 * @param toStop - The stop where the move ends.
 * @returns The moved axis value.
 */
export function shiftGroupStopSet(
    value: GroupStopSet | null | undefined,
    stops: string[] | null | undefined,
    fromStop: string,
    toStop: string,
): GroupStopSet | null {
    if (!stops) return null;
    const indices = groupStopIndices(value, stops);
    const fromIndex = stops.indexOf(fromStop);
    const toIndex = stops.indexOf(toStop);
    if (fromIndex < 0 || toIndex < 0) return value ?? null;
    if (indices.length === 0) return stops[toIndex];
    const min = indices[0];
    const max = indices[indices.length - 1];
    const delta = toIndex - fromIndex;
    const clamped = Math.max(-min, Math.min(stops.length - 1 - max, delta));
    return groupStopSetFromIndices(
        indices.map((i) => i + clamped),
        stops,
    );
}

/**
 * Write a note placement for one axis.
 *
 * The function removes the placement when the group has one stop on the axis.
 * It snaps the stop to the group set when the stop is outside the set.
 *
 * @param note - The note to change.
 * @param dimensionId - The dimension of the group.
 * @param axis - The spectrum axis.
 * @param stop - The wanted stop, or null.
 * @param allowed - The stop indices of the group on the axis.
 * @param stops - The stop names of the spectrum.
 */
function setNotePlacementAxis(
    note: Note,
    dimensionId: string,
    axis: "x" | "y",
    stop: string | null,
    allowed: number[],
    stops: string[] | null | undefined,
): void {
    if (!stops || allowed.length <= 1) {
        if (note.placement?.[dimensionId]) delete note.placement[dimensionId][axis];
        return;
    }
    const wanted = stop ? stops.indexOf(stop) : -1;
    const target = allowed.includes(wanted)
        ? wanted
        : nearestStopIndex(wanted, allowed);
    if (target < 0) return;
    if (!note.placement) note.placement = {};
    if (!note.placement[dimensionId]) note.placement[dimensionId] = {};
    note.placement[dimensionId][axis] = stops[target];
}

/**
 * Clean the placement of one note against its group.
 *
 * The function keeps a placement only on a spanned axis. It removes placements
 * that name an unknown stop or a stop outside the group.
 *
 * @param note - The note to change.
 * @param dimensionId - The dimension of the group.
 * @param group - The group of the note.
 * @param xStops - The X stop names, or null.
 * @param yStops - The Y stop names, or null.
 */
export function normalizeNotePlacement(
    note: Note,
    dimensionId: string,
    group: Group,
    xStops: string[] | null | undefined,
    yStops: string[] | null | undefined,
): void {
    const placement = note.placement?.[dimensionId];
    if (!placement) return;
    const xAllowed = groupStopIndices(group.x, xStops);
    const yAllowed = groupStopIndices(group.y, yStops);
    setNotePlacementAxis(
        note,
        dimensionId,
        "x",
        placement.x ?? null,
        xAllowed,
        xStops,
    );
    setNotePlacementAxis(
        note,
        dimensionId,
        "y",
        placement.y ?? null,
        yAllowed,
        yStops,
    );
    if (note.placement?.[dimensionId]) {
        const rest = note.placement[dimensionId];
        if (!rest.x && !rest.y) delete note.placement[dimensionId];
    }
    if (note.placement && Object.keys(note.placement).length === 0) {
        delete note.placement;
    }
}

/**
 * Place a note at a stop inside its group.
 *
 * The function writes the placement on each spanned axis. It snaps a stop to
 * the group set when the stop is outside the set. It removes the placement on
 * an axis with one stop.
 *
 * @param note - The note to change.
 * @param dimensionId - The dimension of the group.
 * @param group - The group of the note.
 * @param xStop - The wanted X stop, or null.
 * @param yStop - The wanted Y stop, or null.
 * @param xStops - The X stop names, or null.
 * @param yStops - The Y stop names, or null.
 */
export function placeNoteInGroup(
    note: Note,
    dimensionId: string,
    group: Group,
    xStop: string | null,
    yStop: string | null,
    xStops: string[] | null | undefined,
    yStops: string[] | null | undefined,
): void {
    const xAllowed = groupStopIndices(group.x, xStops);
    const yAllowed = groupStopIndices(group.y, yStops);
    if (xAllowed.length > 1) {
        setNotePlacementAxis(note, dimensionId, "x", xStop, xAllowed, xStops);
    } else if (note.placement?.[dimensionId]) {
        delete note.placement[dimensionId].x;
    }
    if (yAllowed.length > 1) {
        setNotePlacementAxis(note, dimensionId, "y", yStop, yAllowed, yStops);
    } else if (note.placement?.[dimensionId]) {
        delete note.placement[dimensionId].y;
    }
    if (note.placement?.[dimensionId]) {
        const rest = note.placement[dimensionId];
        if (!rest.x && !rest.y) delete note.placement[dimensionId];
    }
    if (note.placement && Object.keys(note.placement).length === 0) {
        delete note.placement;
    }
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
 * Rename or drop the stops of a group axis value.
 *
 * @param value - The axis value.
 * @param rename - A map from an old stop name to its new name.
 * @param valid - The stop names of the new spectrum.
 * @returns The changed axis value, or null when no stop remains.
 */
export function remapGroupStopSet(
    value: GroupStopSet | null | undefined,
    rename: Map<string, string>,
    valid: Set<string>,
): GroupStopSet | null {
    if (!value) return null;
    const names = typeof value === "string" ? [value] : value;
    const next: string[] = [];
    for (const name of names) {
        const changed = rename.get(name) ?? name;
        if (valid.has(changed) && !next.includes(changed)) next.push(changed);
    }
    if (next.length === 0) return null;
    if (next.length === 1) return next[0];
    return next;
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
    valid: Set<string>,
): void {
    const placement = note.placement?.[dimensionId];
    const current = placement?.[axis];
    if (!current) return;
    const changed = rename.get(current) ?? current;
    if (valid.has(changed)) placement[axis] = changed;
    else delete placement[axis];
}

/**
 * Keep at most one spanned axis for a group.
 *
 * The function compares the stop counts of the two axes. It collapses the
 * smaller axis to its first stop. A tie keeps the X axis.
 *
 * @param xValue - The X axis value.
 * @param yValue - The Y axis value.
 * @param xStops - The X stop names, or null.
 * @param yStops - The Y stop names, or null.
 * @returns The clean X and Y axis values.
 */
export function enforceSingleAxisSpan(
    xValue: GroupStopSet | null,
    yValue: GroupStopSet | null,
    xStops: string[] | null | undefined,
    yStops: string[] | null | undefined,
): [GroupStopSet | null, GroupStopSet | null] {
    let x = normalizeGroupStopSet(xValue, xStops);
    let y = normalizeGroupStopSet(yValue, yStops);
    const xCount = groupStopCount(x, xStops);
    const yCount = groupStopCount(y, yStops);
    if (xCount > 1 && yCount > 1) {
        if (xCount >= yCount) {
            y = groupStopSetFromIndices([groupStopIndices(y, yStops)[0]], yStops);
        } else {
            x = groupStopSetFromIndices([groupStopIndices(x, xStops)[0]], xStops);
        }
    }
    return [x, y];
}

/**
 * Clean the groups and placements of one dimension.
 *
 * The function makes each axis value canonical, applies the one-axis span rule,
 * and removes placements that no longer fit.
 *
 * @param project - The project to change.
 * @param dimensionId - The dimension to clean.
 */
export function normalizeDimensionSpans(
    project: ProjectData,
    dimensionId: string,
): void {
    const dim = project.dimensions[dimensionId];
    if (!dim) return;
    const xStops = dim["x-spectrum"]?.stops ?? null;
    const yStops = dim["y-spectrum"]?.stops ?? null;
    for (const group of dim.groups) {
        const [x, y] = enforceSingleAxisSpan(group.x, group.y, xStops, yStops);
        group.x = x;
        group.y = y;
    }
    for (const note of Object.values(project.notes)) {
        const groupId = note.membership?.[dimensionId];
        const group = groupId
            ? dim.groups.find((g) => g.id === groupId)
            : undefined;
        if (!group) {
            if (note.placement) delete note.placement[dimensionId];
        } else {
            normalizeNotePlacement(note, dimensionId, group, xStops, yStops);
        }
    }
}

/**
 * Clean the groups and placements of every dimension.
 *
 * @param project - The project to change.
 */
export function normalizeProjectSpans(project: ProjectData): void {
    for (const dimensionId of Object.keys(project.dimensions)) {
        normalizeDimensionSpans(project, dimensionId);
    }
}
