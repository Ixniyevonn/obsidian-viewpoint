import type { ProjectData, Spectrum } from "../types";
import { createUndoManager } from "./undo";

export const DEFAULT_NODE_WIDTH = 200;
export const MIN_NODE_WIDTH = 120;
export const MAX_NODE_WIDTH = 600;

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
    let listeners: Array<() => void> = [];
    const undo = createUndoManager();

    function notify() {
        for (const fn of listeners) fn();
    }

    function snap() { undo.fence(); undo.snapshot(project); }
    function merge() { undo.snapshot(project); }
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

    return {
        get project() { return project; },
        get undo() { return undo; },

        getConnections,

        subscribe(fn: () => void) {
            listeners.push(fn);
            return () => { listeners = listeners.filter(l => l !== fn); };
        },

        load(data: ProjectData) {
            project = data;
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
            touch(); notify();
        },

        removeNote(id: string) {
            snap();
            delete project.notes[id];
            for (const note of Object.values(project.notes)) {
                for (const dimId of Object.keys(note.connections)) {
                    note.connections[dimId] = note.connections[dimId].filter(c => c.to !== id);
                }
            }
            touch(); notify();
        },

        updateNodeTitle(id: string, title: string) {
            merge();
            if (project.notes[id]) project.notes[id].title = title;
            touch(); notify();
            return project;
        },

        updateNoteShort(id: string, short: string) {
            merge();
            if (project.notes[id]) project.notes[id].short = short;
            touch(); notify();
            return project;
        },

        updateNoteLong(id: string, long: string) {
            merge();
            if (project.notes[id]) project.notes[id].long = long;
            touch(); notify();
            return project;
        },

        updateNoteWidth(id: string, width: number) {
            merge();
            const clamped = Math.round(Math.max(MIN_NODE_WIDTH, Math.min(MAX_NODE_WIDTH, width)));
            if (project.notes[id]) {
                project.notes[id].width = clamped === DEFAULT_NODE_WIDTH ? undefined : clamped;
            }
            touch(); notify();
            return project;
        },

        setNoteMembership(noteId: string, dimensionId: string, groupId: string | null) {
            snap();
            if (project.notes[noteId]) {
                project.notes[noteId].membership[dimensionId] = groupId;
            }
            touch(); notify();
            return project;
        },

        // --- Dimensions ---

        addDimension(id: string, name: string, xSpectrum?: Spectrum | null, ySpectrum?: Spectrum | null) {
            snap();
            const dim: any = { name, groups: [] };
            if (xSpectrum) dim["x-spectrum"] = xSpectrum;
            if (ySpectrum) dim["y-spectrum"] = ySpectrum;
            project.dimensions[id] = dim;
            touch(); notify();
            return project;
        },

        removeDimension(id: string) {
            snap();
            delete project.dimensions[id];
            for (const note of Object.values(project.notes)) {
                delete note.membership[id];
            }
            for (const key of Object.keys(project.node_order)) {
                if (key.startsWith(id + ":")) delete project.node_order[key];
            }
            touch(); notify();
            return project;
        },

        updateDimension(id: string, name: string, xSpectrum: Spectrum | null, ySpectrum: Spectrum | null) {
            snap();
            const dim = project.dimensions[id];
            if (!dim) return project;

            dim.name = name;

            if (xSpectrum) {
                dim["x-spectrum"] = xSpectrum;
            } else {
                delete dim["x-spectrum"];
                for (const g of dim.groups) g.x = null;
            }

            if (ySpectrum) {
                dim["y-spectrum"] = ySpectrum;
            } else {
                delete dim["y-spectrum"];
                for (const g of dim.groups) g.y = null;
            }

            if (xSpectrum) {
                const validStops = new Set(xSpectrum.stops);
                for (const g of dim.groups) {
                    if (g.x && !validStops.has(g.x)) g.x = null;
                }
            }
            if (ySpectrum) {
                const validStops = new Set(ySpectrum.stops);
                for (const g of dim.groups) {
                    if (g.y && !validStops.has(g.y)) g.y = null;
                }
            }

            touch(); notify();
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
            touch(); notify();
            return project;
        },

        renameGroup(dimensionId: string, groupId: string, name: string) {
            merge();
            const dim = project.dimensions[dimensionId];
            if (dim) {
                const group = dim.groups.find((g) => g.id === groupId);
                if (group) group.name = name;
            }
            touch(); notify();
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
                    }
                }
                delete project.node_order[`${dimensionId}:${groupId}`];
            }
            touch(); notify();
            return project;
        },

        setGroupStop(dimensionId: string, groupId: string, axis: "x" | "y", stopName: string | null) {
            snap();
            const dim = project.dimensions[dimensionId];
            if (!dim) return project;
            const group = dim.groups.find((g) => g.id === groupId);
            if (!group) return project;
            group[axis] = stopName;
            touch(); notify();
            return project;
        },

        // --- Connections ---

        addConnection(dimensionId: string, from: string, to: string, label: string | null = null) {
            snap();
            const note = project.notes[from];
            if (!note) return;
            if (!note.connections[dimensionId]) note.connections[dimensionId] = [];
            note.connections[dimensionId].push({ to, label });
            touch(); notify();
        },

        removeConnection(dimensionId: string, from: string, to: string) {
            snap();
            const note = project.notes[from];
            if (!note?.connections?.[dimensionId]) return;
            note.connections[dimensionId] = note.connections[dimensionId].filter(c => c.to !== to);
            touch(); notify();
        },

        updateConnectionLabel(dimensionId: string, from: string, to: string, label: string | null) {
            merge();
            const note = project.notes[from];
            if (!note?.connections?.[dimensionId]) return;
            const conn = note.connections[dimensionId].find(c => c.to === to);
            if (conn) conn.label = label;
            touch(); notify();
        },

        // --- Node Order ---

        setNodeOrder(dimensionId: string, groupId: string | "ungrouped", order: string[]) {
            snap();
            project.node_order[`${dimensionId}:${groupId}`] = order;
            touch(); notify();
            return project;
        },
    };
}

export type ProjectStore = ReturnType<typeof createProjectStore>;