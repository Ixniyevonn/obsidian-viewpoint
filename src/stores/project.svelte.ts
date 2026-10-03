import type { GroupCell, ProjectData, Spectrum } from "../types";
import { createUndoManager } from "./undo";

import { MIN_NODE_WIDTH, MAX_NODE_WIDTH } from "../utils/nodeWidth";
import {
    cellsToIndices,
    clearNotePlacement,
    effectiveCellIndex,
    indicesToCells,
    nearestCellIndex,
    normalizeDimensionCells,
    normalizeGroupCells,
    normalizeProjectCells,
    placeNoteInGroup,
    remapGroupCells,
    remapNotePlacement,
    setNotePlacementCell,
    type CellIndex,
} from "../utils/groupStops";
import { spectrumStopRenameMap } from "../utils/spectrum";
import { tagNameFromMarkdown } from "../utils/tags";
export {
    DEFAULT_NODE_WIDTH,
    MIN_NODE_WIDTH,
    MAX_NODE_WIDTH,
} from "../utils/nodeWidth";

export function emptyProject(): ProjectData {
    return {
        meta: {
            name: "Untitled",
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
        },
        dimensions: {
            default: {
                name: "Default",
                groups: [],
            },
        },
        notes: {},
        node_order: {},
    };
}

export function createProjectStore() {
    let project = $state(emptyProject());
    let sourcePath = $state("");
    let listeners: Array<() => void> = [];
    const undo = createUndoManager();

    function notify() {
        for (const fn of listeners) fn();
    }

    function snap() {
        undo.fence();
        undo.snapshot(project);
    }
    function merge() {
        undo.snapshot(project);
    }
    function touch() {
        project.meta.modified = new Date().toISOString();
    }

    function getConnections(dimId: string) {
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

    /** Return true when two cell lists hold the same cells. */
    function sameCells(a: GroupCell[], b: GroupCell[]): boolean {
        if (a.length !== b.length) return false;
        const key = (cell: GroupCell) =>
            `${cell.x ?? "\u0001"}|${cell.y ?? "\u0001"}`;
        const set = new Set(a.map(key));
        return b.every((cell) => set.has(key(cell)));
    }

    /**
     * Replace the cells of a group and repair the member placements.
     *
     * @param dimensionId - The dimension of the group.
     * @param groupId - The group to change.
     * @param cells - The wanted cells.
     * @returns True when the change applies.
     */
    function applyGroupCells(
        dimensionId: string,
        groupId: string,
        cells: GroupCell[],
    ): boolean {
        const dim = project.dimensions[dimensionId];
        if (!dim) return false;
        const group = dim.groups.find((g) => g.id === groupId);
        if (!group) return false;
        const xStops = dim["x-spectrum"]?.stops ?? null;
        const yStops = dim["y-spectrum"]?.stops ?? null;
        const next = normalizeGroupCells(cells, xStops, yStops);
        if (sameCells(next, group.cells)) return false;

        // Remember the cell each member uses before the change.
        const oldIndices = cellsToIndices(group.cells, xStops, yStops);
        const oldCells = new Map<string, CellIndex>();
        for (const [noteId, note] of Object.entries(project.notes)) {
            if (note.membership[dimensionId] !== groupId) continue;
            const indexCell = effectiveCellIndex(
                note.placement?.[dimensionId],
                oldIndices,
                xStops,
                yStops,
            );
            if (indexCell) oldCells.set(noteId, indexCell);
        }

        snap();
        group.cells = next;
        const newIndices = cellsToIndices(next, xStops, yStops);
        for (const [noteId, note] of Object.entries(project.notes)) {
            if (note.membership[dimensionId] !== groupId) continue;
            const old = oldCells.get(noteId);
            if (!old) continue;
            if (newIndices.length <= 1) {
                clearNotePlacement(note, dimensionId);
                continue;
            }
            const target = nearestCellIndex(newIndices, old);
            const [targetCell] = indicesToCells([target], xStops, yStops);
            if (targetCell) {
                setNotePlacementCell(note, dimensionId, targetCell, xStops, yStops);
            }
        }
        touch();
        notify();
        return true;
    }

    return {
        get project() {
            return project;
        },
        get sourcePath() {
            return sourcePath;
        },
        set sourcePath(path: string) {
            sourcePath = path;
        },
        get undo() {
            return undo;
        },

        getConnections,

        subscribe(fn: () => void) {
            listeners.push(fn);
            return () => {
                listeners = listeners.filter((l) => l !== fn);
            };
        },

        load(data: ProjectData) {
            project = data;
            normalizeProjectCells(project);
            undo.clear();
        },

        reset() {
            project = emptyProject();
            undo.clear();
        },

        // --- Undo / Redo ---

        performUndo() {
            const prev = undo.undo(project);
            if (prev) {
                project = prev;
                notify();
                return true;
            }
            return false;
        },

        performRedo() {
            const next = undo.redo(project);
            if (next) {
                project = next;
                notify();
                return true;
            }
            return false;
        },

        // --- Notes ---

        addNote(id: string, title: string) {
            snap();
            project.notes[id] = {
                title,
                short: "",
                long: "",
                membership: {},
                connections: {},
            };
            touch();
            notify();
        },

        removeNote(id: string) {
            snap();
            delete project.notes[id];
            for (const note of Object.values(project.notes)) {
                for (const dimId of Object.keys(note.connections)) {
                    note.connections[dimId] = note.connections[dimId].filter(
                        (c) => c.to !== id,
                    );
                }
            }
            touch();
            notify();
        },

        /**
         * Remove several notes as one undo step.
         *
         * @param ids - The note IDs to remove.
         */
        removeNotes(ids: string[]) {
            if (ids.length === 0) return;
            snap();
            const removed = new Set(ids);
            for (const id of ids) delete project.notes[id];
            for (const note of Object.values(project.notes)) {
                for (const dimId of Object.keys(note.connections)) {
                    note.connections[dimId] = note.connections[dimId].filter(
                        (c) => !removed.has(c.to),
                    );
                }
            }
            touch();
            notify();
        },

        updateNodeTitle(id: string, title: string) {
            merge();
            if (project.notes[id]) project.notes[id].title = title;
            touch();
            notify();
            return project;
        },

        updateNoteShort(id: string, short: string) {
            merge();
            if (project.notes[id]) project.notes[id].short = short;
            touch();
            notify();
            return project;
        },

        updateNoteLong(id: string, long: string) {
            merge();
            if (project.notes[id]) project.notes[id].long = long;
            touch();
            notify();
            return project;
        },

        updateNoteWidth(id: string, width: number | undefined) {
            merge();
            const clamped = Math.round(
                Math.max(
                    MIN_NODE_WIDTH,
                    Math.min(MAX_NODE_WIDTH, width ?? MIN_NODE_WIDTH),
                ),
            );
            if (project.notes[id]) {
                project.notes[id].width = width === undefined ? undefined : clamped;
            }
            touch();
            notify();
            return project;
        },

        addNoteTag(id: string, tag: string) {
            const note = project.notes[id];
            const name = tagNameFromMarkdown(tag);
            if (!note || !name) return project;
            if (
                note.tags?.some(
                    (item) =>
                        tagNameFromMarkdown(item).toLowerCase() === name.toLowerCase(),
                )
            ) {
                return project;
            }
            snap();
            if (!note.tags) note.tags = [];
            note.tags.push(tag);
            touch();
            notify();
            return project;
        },

        removeNoteTag(id: string, index: number) {
            const note = project.notes[id];
            if (!note?.tags || index < 0 || index >= note.tags.length) return project;
            snap();
            note.tags.splice(index, 1);
            if (!note.tags.length) delete note.tags;
            touch();
            notify();
            return project;
        },

        setNoteMembership(
            noteId: string,
            dimensionId: string,
            groupId: string | null,
        ) {
            snap();
            if (project.notes[noteId]) {
                project.notes[noteId].membership[dimensionId] = groupId;
            }
            touch();
            notify();
            return project;
        },

        /**
         * Move a note into a group and set its stop placement.
         *
         * The function snaps each spanned axis to the nearest stop in the group
         * set. It removes the placement when the group has one stop on the axis.
         *
         * @param noteId - The note to move.
         * @param dimensionId - The dimension of the group.
         * @param groupId - The target group, or null to ungroup.
         * @param xStop - The wanted X stop, or null.
         * @param yStop - The wanted Y stop, or null.
         */
        moveNoteToGroup(
            noteId: string,
            dimensionId: string,
            groupId: string | null,
            xStop: string | null,
            yStop: string | null,
        ) {
            const note = project.notes[noteId];
            if (!note) return project;
            snap();
            note.membership[dimensionId] = groupId;
            const dim = project.dimensions[dimensionId];
            const group = groupId
                ? dim?.groups.find((g) => g.id === groupId)
                : undefined;
            if (!group) {
                clearNotePlacement(note, dimensionId);
            } else {
                placeNoteInGroup(
                    note,
                    dimensionId,
                    group.cells,
                    xStop,
                    yStop,
                    dim?.["x-spectrum"]?.stops ?? null,
                    dim?.["y-spectrum"]?.stops ?? null,
                );
            }
            touch();
            notify();
            return project;
        },

        // --- Dimensions ---

        addDimension(
            id: string,
            name: string,
            xSpectrum?: Spectrum | null,
            ySpectrum?: Spectrum | null,
        ) {
            snap();
            const dim: any = { name, groups: [] };
            if (xSpectrum) dim["x-spectrum"] = xSpectrum;
            if (ySpectrum) dim["y-spectrum"] = ySpectrum;
            project.dimensions[id] = dim;
            touch();
            notify();
            return project;
        },

        removeDimension(id: string) {
            snap();
            delete project.dimensions[id];
            for (const note of Object.values(project.notes)) {
                delete note.membership[id];
                clearNotePlacement(note, id);
            }
            for (const key of Object.keys(project.node_order)) {
                if (key.startsWith(id + ":")) delete project.node_order[key];
            }
            touch();
            notify();
            return project;
        },

        updateDimension(
            id: string,
            name: string,
            xSpectrum: Spectrum | null,
            ySpectrum: Spectrum | null,
        ) {
            snap();
            const dim = project.dimensions[id];
            if (!dim) return project;

            dim.name = name;

            const oldX = dim["x-spectrum"];
            const oldY = dim["y-spectrum"];

            let xRename = new Map<string, string>();
            let yRename = new Map<string, string>();
            let xValid: Set<string> | null = null;
            let yValid: Set<string> | null = null;

            if (xSpectrum) {
                dim["x-spectrum"] = xSpectrum;
                xRename = spectrumStopRenameMap(oldX?.stops, xSpectrum.stops);
                xValid = new Set(xSpectrum.stops);
                for (const note of Object.values(project.notes)) {
                    remapNotePlacement(note, id, "x", xRename, xValid);
                }
            } else {
                delete dim["x-spectrum"];
            }

            if (ySpectrum) {
                dim["y-spectrum"] = ySpectrum;
                yRename = spectrumStopRenameMap(oldY?.stops, ySpectrum.stops);
                yValid = new Set(ySpectrum.stops);
                for (const note of Object.values(project.notes)) {
                    remapNotePlacement(note, id, "y", yRename, yValid);
                }
            } else {
                delete dim["y-spectrum"];
            }

            for (const g of dim.groups) {
                g.cells = remapGroupCells(g.cells, xRename, yRename, xValid, yValid);
            }

            normalizeDimensionCells(project, id);

            touch();
            notify();
            return project;
        },

        // --- Groups ---

        addGroup(dimensionId: string, groupId: string, name: string) {
            snap();
            const dim = project.dimensions[dimensionId];
            if (dim) {
                dim.groups.push({ id: groupId, name, cells: [] });
                project.node_order[`${dimensionId}:${groupId}`] = [];
            }
            touch();
            notify();
            return project;
        },

        renameGroup(dimensionId: string, groupId: string, name: string) {
            merge();
            const dim = project.dimensions[dimensionId];
            if (dim) {
                const group = dim.groups.find((g) => g.id === groupId);
                if (group) group.name = name;
            }
            touch();
            notify();
            return project;
        },

        /**
         * Set the explicit color of a group.
         *
         * @param dimensionId - The dimension of the group.
         * @param groupId - The group to change.
         * @param color - The color key, or null for the automatic name color.
         * @returns True when the change applies.
         */
        setGroupColor(
            dimensionId: string,
            groupId: string,
            color: string | null,
        ): boolean {
            const dim = project.dimensions[dimensionId];
            const group = dim?.groups.find((g) => g.id === groupId);
            if (!group) return false;
            const next = color ?? undefined;
            if (group.color === next) return false;
            snap();
            if (next) group.color = next;
            else delete group.color;
            touch();
            notify();
            return true;
        },

        removeGroup(dimensionId: string, groupId: string) {
            snap();
            const dim = project.dimensions[dimensionId];
            if (dim) {
                dim.groups = dim.groups.filter((g) => g.id !== groupId);
                for (const note of Object.values(project.notes)) {
                    if (note.membership[dimensionId] === groupId) {
                        note.membership[dimensionId] = null;
                        clearNotePlacement(note, dimensionId);
                    }
                }
                delete project.node_order[`${dimensionId}:${groupId}`];
            }
            touch();
            notify();
            return project;
        },

        /**
         * Remove several groups as one undo step.
         *
         * @param dimensionId - The dimension of the groups.
         * @param groupIds - The group IDs to remove.
         */
        removeGroups(dimensionId: string, groupIds: string[]) {
            if (groupIds.length === 0) return;
            snap();
            const dim = project.dimensions[dimensionId];
            if (dim) {
                const removed = new Set(groupIds);
                dim.groups = dim.groups.filter((g) => !removed.has(g.id));
                for (const note of Object.values(project.notes)) {
                    const groupId = note.membership[dimensionId];
                    if (groupId && removed.has(groupId)) {
                        note.membership[dimensionId] = null;
                        clearNotePlacement(note, dimensionId);
                    }
                }
                for (const groupId of groupIds) {
                    delete project.node_order[`${dimensionId}:${groupId}`];
                }
            }
            touch();
            notify();
        },

        setGroupCells(
            dimensionId: string,
            groupId: string,
            cells: GroupCell[],
        ): boolean {
            return applyGroupCells(dimensionId, groupId, cells);
        },

        // --- Connections ---

        addConnection(
            dimensionId: string,
            from: string,
            to: string,
            label: string | null = null,
        ) {
            snap();
            const note = project.notes[from];
            if (!note) return;
            if (!note.connections[dimensionId]) note.connections[dimensionId] = [];
            note.connections[dimensionId].push({ to, label });
            touch();
            notify();
        },

        removeConnection(dimensionId: string, from: string, to: string) {
            snap();
            const note = project.notes[from];
            if (!note?.connections?.[dimensionId]) return;
            note.connections[dimensionId] = note.connections[dimensionId].filter(
                (c) => c.to !== to,
            );
            touch();
            notify();
        },

        updateConnectionLabel(
            dimensionId: string,
            from: string,
            to: string,
            label: string | null,
        ) {
            merge();
            const note = project.notes[from];
            if (!note?.connections?.[dimensionId]) return;
            const conn = note.connections[dimensionId].find((c) => c.to === to);
            if (conn) conn.label = label;
            touch();
            notify();
        },

        // --- Node Order ---

        setNodeOrder(
            dimensionId: string,
            groupId: string | "ungrouped",
            order: string[],
        ) {
            snap();
            project.node_order[`${dimensionId}:${groupId}`] = order;
            touch();
            notify();
            return project;
        },
    };
}

export type ProjectStore = ReturnType<typeof createProjectStore>;
