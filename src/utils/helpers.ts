import yaml from "js-yaml";
import type { ProjectData } from "../types";

export function generateId(prefix: string = ""): string {
    const rand = Math.random().toString(36).substring(2, 8);
    const ts = Date.now().toString(36).slice(-4);
    return prefix ? `${prefix}-${ts}${rand}` : `${ts}${rand}`;
}

export function serializeProject(data: ProjectData): string {
    return yaml.dump(data, { lineWidth: -1, noRefs: true, sortKeys: false });
}

export function deserializeProject(raw: string): ProjectData {
    const data = yaml.load(raw) as ProjectData;

    // Migration from old top-level connections
    if ("connections" in data && data.connections) {
        for (const [dimId, conns] of Object.entries(data.connections)) {
            for (const conn of conns as any[]) {
                const note = data.notes[conn.from];
                if (note) {
                    if (!note.connections) note.connections = {};
                    if (!note.connections[dimId]) note.connections[dimId] = [];
                    note.connections[dimId].push({
                        to: conn.to,
                        label: conn.label ?? null,
                    });
                }
            }
        }
        delete (data as any).connections;
    }

    // Ensure every note has connections object
    for (const note of Object.values(data.notes)) {
        if (!note.connections) note.connections = {};
    }

    return data;
}