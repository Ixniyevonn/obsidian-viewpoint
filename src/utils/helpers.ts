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

	// Ensure every note has connections object and a valid tag list
	for (const note of Object.values(data.notes)) {
		if (!note.connections) note.connections = {};
		if (Array.isArray(note.tags)) {
			note.tags = note.tags.filter(
				(tag) => typeof tag === "string" && tag.trim().length > 0,
			);
		}
		if (!Array.isArray(note.tags) || note.tags.length === 0) {
			delete note.tags;
		}
	}

	// Migrate legacy group x/y placements to cells.
	for (const dim of Object.values(data.dimensions)) {
		const groups = dim.groups as unknown as Array<Record<string, unknown>>;
		for (const group of groups) {
			if (Array.isArray(group.cells)) continue;
			const xs = toStopList(group.x);
			const ys = toStopList(group.y);
			const cells: Array<{ x: string | null; y: string | null }> = [];
			if (xs.length > 0 && ys.length > 0) {
				for (const x of xs) for (const y of ys) cells.push({ x, y });
			} else if (xs.length > 0) {
				for (const x of xs) cells.push({ x, y: null });
			} else if (ys.length > 0) {
				for (const y of ys) cells.push({ x: null, y });
			}
			group.cells = cells;
			delete group.x;
			delete group.y;
		}
	}

	return data;
}

/** Return the stop names of a legacy group axis value. */
function toStopList(value: unknown): string[] {
	if (typeof value === "string") return [value];
	if (Array.isArray(value)) {
		return value.filter((item): item is string => typeof item === "string");
	}
	return [];
}
