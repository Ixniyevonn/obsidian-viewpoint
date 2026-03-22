import type { ProjectData } from "../types";

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

    function notify() {
        for (const fn of listeners) fn();
    }

    return {
        get project() { return project; },

        subscribe(fn: () => void) {
            listeners.push(fn);
            return () => { listeners = listeners.filter(l => l !== fn); };
        },

        load(data: ProjectData) {
            project = data
        },

        reset() {
            project = emptyProject();
        },

        // --- Notes ---

        addNote(id: string, title: string) {
            project.notes[id] = { title, short: "", long: "", membership: {} };
            project.meta.modified = new Date().toISOString();
            notify();
            return project;
        },

        removeNote(id: string) {
            delete project.notes[id];
            for (const dimId of Object.keys(project.connections)) {
                project.connections[dimId] = project.connections[dimId].filter(
                    (c) => c.from !== id && c.to !== id
                );
            }
            for (const key of Object.keys(project.node_order)) {
                project.node_order[key] = project.node_order[key].filter((n) => n !== id);
            }
            project.meta.modified = new Date().toISOString();
            notify();
            return project;
        },

        updateNodeTitle(id: string, title: string) {
            if (project.notes[id]) project.notes[id].title = title;
            project.meta.modified = new Date().toISOString();
            notify();
            return project;
        },

        updateNoteShort(id: string, short: string) {
            if (project.notes[id]) project.notes[id].short = short;
            project.meta.modified = new Date().toISOString();
            notify();
            return project;
        },

        updateNoteLong(id: string, long: string) {
            if (project.notes[id]) project.notes[id].long = long;
            project.meta.modified = new Date().toISOString();
            notify();
            return project;
        },

        setNoteMembership(noteId: string, dimensionId: string, groupId: string | null) {
            if (project.notes[noteId]) {
                project.notes[noteId].membership[dimensionId] = groupId;
            }
            project.meta.modified = new Date().toISOString();
            notify();
            return project;
        },

        // --- Dimensions ---

        addDimension(id: string, name: string) {
            project.dimensions[id] = { name, groups: [] };
            project.connections[id] = [];
            project.meta.modified = new Date().toISOString();
            notify();
            return project;
        },

        removeDimension(id: string) {
            delete project.dimensions[id];
            delete project.connections[id];
            for (const note of Object.values(project.notes)) {
                delete note.membership[id];
            }
            for (const key of Object.keys(project.node_order)) {
                if (key.startsWith(id + ":")) delete project.node_order[key];
            }
            project.meta.modified = new Date().toISOString();
            notify();
            return project;
        },

        // --- Groups ---

        addGroup(dimensionId: string, groupId: string, name: string) {
            const dim = project.dimensions[dimensionId];
            if (dim) {
                dim.groups.push({ id: groupId, name, x: null, y: null });
                project.node_order[`${dimensionId}:${groupId}`] = [];
            }
            project.meta.modified = new Date().toISOString();
            notify();
            return project;
        },

        removeGroup(dimensionId: string, groupId: string) {
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
            project.meta.modified = new Date().toISOString();
            notify();
            return project;
        },

        // --- Connections ---

        addConnection(dimensionId: string, from: string, to: string, label: string | null = null) {
            if (!project.connections[dimensionId]) project.connections[dimensionId] = [];
            project.connections[dimensionId].push({ from, to, label });
            project.meta.modified = new Date().toISOString();
            notify();
            return project;
        },

        removeConnection(dimensionId: string, index: number) {
            if (project.connections[dimensionId]) {
                project.connections[dimensionId].splice(index, 1);
            }
            project.meta.modified = new Date().toISOString();
            notify();
            return project;
        },

        updateConnectionLabel(dimensionId: string, index: number, label: string | null) {
            const conns = project.connections[dimensionId];
            if (conns && conns[index]) {
                conns[index].label = label;
            }
            project.meta.modified = new Date().toISOString();
            notify();
            return project;
        },

        // --- Node Order ---

        setNodeOrder(dimensionId: string, groupId: string | "ungrouped", order: string[]) {
            project.node_order[`${dimensionId}:${groupId}`] = order;
            project.meta.modified = new Date().toISOString();
            notify();
            return project;
        },
    };
}

export type ProjectStore = ReturnType<typeof createProjectStore>;