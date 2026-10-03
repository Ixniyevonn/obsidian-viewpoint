import type { GroupStopSet, ProjectData, Spectrum } from "../types";
import { createUndoManager } from "./undo";

import { MIN_NODE_WIDTH, MAX_NODE_WIDTH } from "../utils/nodeWidth";
import {
    clearNotePlacement,
    groupStopCount,
    groupStopIndices,
    groupStopSetFromIndices,
    normalizeGroupStopSet,
    normalizeDimensionSpans,
    normalizeNotePlacement,
    normalizeProjectSpans,
    placeNoteInGroup,
    remapGroupStopSet,
    remapNotePlacement,
    toggleGroupStopRun,
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

    /**
     * Apply a stop change to a group and repair the member placements.
     *
     * The X axis is primary. A Y span is refused while the X axis has more than
     * one stop. An X span collapses the Y axis to its first stop.
     *
     * @param dimensionId - The dimension of the group.
     * @param groupId - The group to change.
     * @param nextX - The wanted X axis value.
     * @param nextY - The wanted Y axis value.
     * @param changed - The axis that the edit targets.
     * @returns True when the change applies.
     */
    function commitGroupStops(
        dimensionId: string,
        groupId: string,
        nextX: GroupStopSet | null,
        nextY: GroupStopSet | null,
        changed: "x" | "y" | "both",
    ): boolean {
        const dim = project.dimensions[dimensionId];
        if (!dim) return false;
        const group = dim.groups.find((g) => g.id === groupId);
        if (!group) return false;
        const xStops = dim["x-spectrum"]?.stops ?? null;
        const yStops = dim["y-spectrum"]?.stops ?? null;
        let y = normalizeGroupStopSet(nextY, yStops);
        const x = normalizeGroupStopSet(nextX, xStops);
        const xCount = groupStopCount(x, xStops);
        const yCount = groupStopCount(y, yStops);

        if (xCount > 1 && yCount > 1) {
            if (changed === "y") return false;
            y = groupStopSetFromIndices([groupStopIndices(y, yStops)[0]], yStops);
        }

        const currentX = normalizeGroupStopSet(group.x, xStops);
        const currentY = normalizeGroupStopSet(group.y, yStops);
        if (
            JSON.stringify(x) === JSON.stringify(currentX) &&
            JSON.stringify(y) === JSON.stringify(currentY)
        ) {
            return false;
        }

        snap();
        group.x = x;
        group.y = y;
        for (const note of Object.values(project.notes)) {
            if (note.membership[dimensionId] !== groupId) continue;
            normalizeNotePlacement(note, dimensionId, group, xStops, yStops);
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
            normalizeProjectSpans(project);
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
                    group,
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

            if (xSpectrum) {
                dim["x-spectrum"] = xSpectrum;
                const xRename = spectrumStopRenameMap(oldX?.stops, xSpectrum.stops);
                const xValid = new Set(xSpectrum.stops);
                for (const g of dim.groups) {
                    g.x = remapGroupStopSet(g.x, xRename, xValid);
                }
                for (const note of Object.values(project.notes)) {
                    remapNotePlacement(note, id, "x", xRename, xValid);
                }
            } else {
                delete dim["x-spectrum"];
                for (const g of dim.groups) g.x = null;
            }

            if (ySpectrum) {
                dim["y-spectrum"] = ySpectrum;
                const yRename = spectrumStopRenameMap(oldY?.stops, ySpectrum.stops);
                const yValid = new Set(ySpectrum.stops);
                for (const g of dim.groups) {
                    g.y = remapGroupStopSet(g.y, yRename, yValid);
                }
                for (const note of Object.values(project.notes)) {
                    remapNotePlacement(note, id, "y", yRename, yValid);
                }
            } else {
                delete dim["y-spectrum"];
                for (const g of dim.groups) g.y = null;
            }

            normalizeDimensionSpans(project, id);

            touch();
            notify();
            return project;
        },

        // --- Groups ---

        addGroup(dimensionId: string, groupId: string, name: string) {
            snap();
            const dim = project.dimensions[dimensionId];
            if (dim) {
                dim.groups.push({ id: groupId, name, x: null, y: null });
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

        setGroupStop(
            dimensionId: string,
            groupId: string,
            axis: "x" | "y",
            value: GroupStopSet | null,
        ): boolean {
            const dim = project.dimensions[dimensionId];
            const group = dim?.groups.find((g) => g.id === groupId);
            if (!dim || !group) return false;
            const nextX = axis === "x" ? value : group.x;
            const nextY = axis === "y" ? value : group.y;
            return commitGroupStops(dimensionId, groupId, nextX, nextY, axis);
        },

        toggleGroupRun(
            dimensionId: string,
            groupId: string,
            axis: "x" | "y",
            fromStop: string,
            toStop: string,
        ): boolean {
            const dim = project.dimensions[dimensionId];
            const group = dim?.groups.find((g) => g.id === groupId);
            if (!dim || !group) return false;
            const stops =
                axis === "x" ? dim["x-spectrum"]?.stops : dim["y-spectrum"]?.stops;
            if (!stops) return false;
            const fromIndex = stops.indexOf(fromStop);
            const toIndex = stops.indexOf(toStop);
            if (fromIndex < 0 || toIndex < 0) return false;
            const next = toggleGroupStopRun(group[axis], stops, fromIndex, toIndex);
            const nextX = axis === "x" ? next : group.x;
            const nextY = axis === "y" ? next : group.y;
            return commitGroupStops(dimensionId, groupId, nextX, nextY, axis);
        },

        moveGroup(
            dimensionId: string,
            groupId: string,
            nextX: GroupStopSet | null,
            nextY: GroupStopSet | null,
            changed: "x" | "y" | "both" = "both",
        ): boolean {
            return commitGroupStops(dimensionId, groupId, nextX, nextY, changed);
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
