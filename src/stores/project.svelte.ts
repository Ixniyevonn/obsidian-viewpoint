import type { ProjectData } from "../types";
import { createUndoManager } from "./undo";

function emptyProject(): ProjectData {
    return {
        meta: {
            name: "Untitled",
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
        },
        dimensions: {},
        notes: {},
        connections: {},
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

    /** Snapshot before a discrete action (always new undo entry). */
    function snap() {
        undo.fence();
        undo.snapshot(project);
    }

    /** Snapshot before a continuous/mergeable edit (typing). */
    function merge() {
        undo.snapshot(project);
    }

    function touch() {
        project.meta.modified = new Date().toISOString();
    }

    return {
        get project() { return project; },
        get undo() { return undo; },

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
            project.notes[id] = { title, short: "", long: "", membership: {} };
            touch(); notify();
            return project;
        },

        removeNote(id: string) {
            snap();
            delete project.notes[id];
            for (const dimId of Object.keys(project.connections)) {
                project.connections[dimId] = project.connections[dimId].filter(
                    (c) => c.from !== id && c.to !== id
                );
            }
            for (const key of Object.keys(project.node_order)) {
                project.node_order[key] = project.node_order[key].filter((n) => n !== id);
            }
            touch(); notify();
            return project;
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

        setNoteMembership(noteId: string, dimensionId: string, groupId: string | null) {
            snap();
            if (project.notes[noteId]) {
                project.notes[noteId].membership[dimensionId] = groupId;
            }
            touch(); notify();
            return project;
        },

        // --- Dimensions ---

        addDimension(id: string, name: string) {
            snap();
            project.dimensions[id] = { name, groups: [] };
            project.connections[id] = [];
            touch(); notify();
            return project;
        },

        removeDimension(id: string) {
            snap();
            delete project.dimensions[id];
            delete project.connections[id];
            for (const note of Object.values(project.notes)) {
                delete note.membership[id];
            }
            for (const key of Object.keys(project.node_order)) {
                if (key.startsWith(id + ":")) delete project.node_order[key];
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

        // --- Connections ---

        addConnection(dimensionId: string, from: string, to: string, label: string | null = null) {
            snap();
            if (!project.connections[dimensionId]) project.connections[dimensionId] = [];
            project.connections[dimensionId].push({ from, to, label });
            touch(); notify();
            return project;
        },

        removeConnection(dimensionId: string, index: number) {
            snap();
            if (project.connections[dimensionId]) {
                project.connections[dimensionId].splice(index, 1);
            }
            touch(); notify();
            return project;
        },

        updateConnectionLabel(dimensionId: string, index: number, label: string | null) {
            merge();
            const conns = project.connections[dimensionId];
            if (conns && conns[index]) {
                conns[index].label = label;
            }
            touch(); notify();
            return project;
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