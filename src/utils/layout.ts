import type { ProjectData, Spectrum } from "../types";
import { colorKeyToCss, groupColorVariable } from "./color";
import {
	cellsToIndices,
	decomposeGroupRuns,
	effectiveCellIndex,
	type CellIndex,
	type GroupRun,
} from "./groupStops";
import {
	DEFAULT_FONTS,
	measureTextHeight,
	measureTextWidth,
	type FontConfig,
} from "./textMeasure";

import {
	DEFAULT_NODE_WIDTH,
	noteWidth as resolvedNoteWidth,
} from "./nodeWidth";

/**
 * Build a memoized width lookup for one layout pass.
 *
 * The function measures each title with the passed fonts and caches the result
 * during the pass.
 *
 * @param project - The project data with the notes.
 * @param fonts - The title and body font configuration.
 * @returns A function that gives the card width for a note identifier.
 */
function makeWidthOf(
	project: ProjectData,
	fonts: FontConfig,
): (noteId: string) => number {
	const widths = new Map<string, number>();
	return (noteId: string) => {
		let width = widths.get(noteId);
		if (width === undefined) {
			const note = project.notes[noteId];
			width = resolvedNoteWidth(
				note,
				measureTextWidth(note.title, fonts.titleFont),
			);
			widths.set(noteId, width);
		}
		return width;
	};
}

function getConnectionsForDimension(
	project: ProjectData,
	dimId: string,
): { from: string; to: string; label: string | null }[] {
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
	/** True when one axis of the group has more than one stop. */
	complex: boolean;
	/** The CSS color value of a complex group. */
	color?: string;
}

/** One background box of a group. A detached stop set gives several boxes. */
export interface GroupBoxLayout {
	groupId: string;
	x: number;
	y: number;
	width: number;
	height: number;
	name: string;
	/** The CSS color value of the group. */
	color?: string;
	/** First stop index of the box on the X axis. */
	xFrom: number;
	/** Last stop index of the box on the X axis. */
	xTo: number;
	/** First stop index of the box on the Y axis. */
	yFrom: number;
	/** Last stop index of the box on the Y axis. */
	yTo: number;
}

export interface LayoutResult {
	nodes: Record<string, NodeLayout>;
	groups: Record<string, GroupLayout>;
	groupBoxes: GroupBoxLayout[];
	xSpectrum?: SpectrumLayout;
	ySpectrum?: SpectrumLayout;
}

export interface SpectrumLayout {
	name: string;
	poles: [string, string];
	stops: { name: string; position: number }[];
	extent: number;
}

export interface LayoutOptions {
	nodeGap?: number;
	groupGap?: number;
	groupPadding?: number;
	gridColumns?: number;
	fonts?: FontConfig;
	/** Actual measured DOM heights keyed by noteId. Overrides estimation. */
	measuredHeights?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Node height estimation
// ---------------------------------------------------------------------------

const NODE_PAD_TOP = 8;
const NODE_PAD_MID = 8;
const NODE_PAD_BOTTOM = 8;
const NODE_MIN_H = 64;

function estimateNodeHeight(
	title: string,
	short: string,
	nw: number,
	fonts: FontConfig,
): number {
	const contentWidth = nw - 32;
	const titleH = measureTextHeight(
		title,
		fonts.titleFont,
		contentWidth,
		fonts.titleLineHeight,
	).height;

	let bodyH = 0;
	if (short) {
		bodyH = measureTextHeight(
			short,
			fonts.bodyFont,
			contentWidth,
			fonts.bodyLineHeight,
		).height;
	}

	const total =
		NODE_PAD_TOP +
		titleH +
		(short ? NODE_PAD_MID + bodyH : 0) +
		NODE_PAD_BOTTOM;
	return Math.max(NODE_MIN_H, total);
}

// ---------------------------------------------------------------------------
// Group adjacency / BFS
// ---------------------------------------------------------------------------

function buildGroupAdjacency(
	connections: { from: string; to: string; label: string | null }[],
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

function computeGroupPlacements(
	adj: Map<string, Set<string>>,
	allGroupIds: string[],
): Map<string, GroupPlacement> {
	const placement = new Map<string, GroupPlacement>();

	let root = allGroupIds[0];
	let maxDeg = -1;
	for (const [id, neighbors] of adj) {
		if (neighbors.size > maxDeg) {
			maxDeg = neighbors.size;
			root = id;
		}
	}

	if (maxDeg <= 0) {
		for (let i = 0; i < allGroupIds.length; i++) {
			placement.set(allGroupIds[i], { col: i, row: 0 });
		}
		return placement;
	}

	const visited = new Set<string>();
	const colRows = new Map<number, number>();

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
				const direction = currentCol > 0 ? 1 : -1;
				for (const id of unvisited) {
					placeAt(id, currentCol + direction);
					nextFrontier.push(id);
				}
			}
		}

		frontier = nextFrontier;
	}

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

/**
 * Return a stable order that keeps connected groups next to each other.
 *
 * The function walks the group graph from the group with the most
 * connections. Groups without a connection keep their input order.
 *
 * @param allGroupIds - Every group in the dimension, in input order.
 * @param adj - The group adjacency map.
 * @returns The group IDs in visiting order.
 */
function orderGroupsByConnections(
	allGroupIds: string[],
	adj: Map<string, Set<string>>,
): string[] {
	if (!allGroupIds.length) return [];

	let root = allGroupIds[0];
	let maxDegree = -1;
	for (const id of allGroupIds) {
		const degree = adj.get(id)?.size ?? 0;
		if (degree > maxDegree) {
			maxDegree = degree;
			root = id;
		}
	}

	const ordered: string[] = [];
	const seen = new Set<string>();
	const queue = [root];
	while (queue.length) {
		const id = queue.shift();
		if (id === undefined) break;
		if (seen.has(id)) continue;
		seen.add(id);
		ordered.push(id);
		for (const neighbor of adj.get(id) ?? []) {
			if (!seen.has(neighbor)) queue.push(neighbor);
		}
	}
	for (const id of allGroupIds) {
		if (!seen.has(id)) ordered.push(id);
	}
	return ordered;
}

/**
 * Order the groups in each column by their connected groups.
 *
 * The function walks the columns from left to right. A column sorts its
 * groups by the average position of their neighbors in the columns to the
 * left. A group without such a neighbor keeps its place. The footprint does
 * not change, because each column keeps the same groups.
 *
 * @param columns - The groups of each column. The function mutates it.
 * @param adj - The group adjacency map.
 */
export function orderColumnsByConnections(
	columns: Map<number, string[]>,
	adj: Map<string, Set<string>>,
): void {
	const sortedCols = [...columns.keys()].sort((a, b) => a - b);
	const groupColumn = new Map<string, number>();
	const indexInColumn = new Map<string, number>();
	for (const [col, ids] of columns) {
		ids.forEach((id, index) => {
			groupColumn.set(id, col);
			indexInColumn.set(id, index);
		});
	}

	for (const col of sortedCols) {
		const ids = columns.get(col);
		if (!ids) continue;
		const barycenter = new Map<string, number>();
		let hasNeighbor = false;
		for (const id of ids) {
			const positions: number[] = [];
			for (const neighbor of adj.get(id) ?? []) {
				if ((groupColumn.get(neighbor) ?? col) >= col) continue;
				const position = indexInColumn.get(neighbor);
				if (position !== undefined) positions.push(position);
			}
			if (positions.length) hasNeighbor = true;
			barycenter.set(
				id,
				positions.length
					? positions.reduce((a, b) => a + b, 0) / positions.length
					: (indexInColumn.get(id) ?? 0),
			);
		}
		if (!hasNeighbor) continue;
		ids.sort((a, b) => (barycenter.get(a) ?? 0) - (barycenter.get(b) ?? 0));
		ids.forEach((id, index) => {
			indexInColumn.set(id, index);
		});
	}
}

// ---------------------------------------------------------------------------
// Helper: compute group width from its members
// ---------------------------------------------------------------------------

function groupWidthForMembers(
	members: string[],
	widthOf: (id: string) => number,
	groupPadding: number,
): number {
	let maxNw = DEFAULT_NODE_WIDTH;
	for (const id of members) {
		maxNw = Math.max(maxNw, widthOf(id));
	}
	return maxNw + groupPadding * 2;
}

// ---------------------------------------------------------------------------
// Helper: place nodes inside a group
// ---------------------------------------------------------------------------

const LABEL_H = 40;

function placeNodesInGroup(
	members: string[],
	gx: number,
	gy: number,
	nodeGap: number,
	groupPadding: number,
	groupWidth: number,
	heightOf: (id: string) => number,
	widthOf: (id: string) => number,
	result: LayoutResult,
): number {
	if (members.length === 0) {
		return LABEL_H + groupPadding * 2;
	}

	const startY = gy + LABEL_H + groupPadding;
	let cursorY = startY;

	for (const noteId of members) {
		const nw = widthOf(noteId);
		const h = heightOf(noteId);
		result.nodes[noteId] = {
			x: gx + groupPadding,
			y: cursorY,
			width: nw,
			height: h,
		};
		cursorY += h + nodeGap;
	}

	const groupHeight = cursorY - nodeGap - gy + groupPadding;
	return groupHeight;
}

// ---------------------------------------------------------------------------
// Main layout engine
// ---------------------------------------------------------------------------

export function layoutEngine(
	project: ProjectData,
	activeDimensionId: string | null,
	options: LayoutOptions = {},
): LayoutResult {
	const {
		nodeGap = 24,
		groupGap = 60,
		groupPadding = 40,
		gridColumns = 3,
		fonts = DEFAULT_FONTS,
		measuredHeights = {},
	} = options;

	const result: LayoutResult = { nodes: {}, groups: {}, groupBoxes: [] };
	const noteIds = Object.keys(project.notes);
	const widthOf = makeWidthOf(project, fonts);

	/** Cached card height for this pass. */
	const heightCache = new Map<string, number>();

	/** Use measured DOM height if available, otherwise estimate via pretext */
	function heightOf(id: string): number {
		const cached = heightCache.get(id);
		if (cached !== undefined) return cached;
		let height: number;
		if (measuredHeights[id] !== undefined) {
			height = measuredHeights[id];
		} else {
			const note = project.notes[id];
			const nw = widthOf(id);
			height = estimateNodeHeight(note.title, note.short, nw, fonts);
		}
		heightCache.set(id, height);
		return height;
	}

	const dim = activeDimensionId ? project.dimensions[activeDimensionId] : null;

	// No dimension — flat grid fallback
	if (!dim || !activeDimensionId) {
		const colHeights = new Array(gridColumns).fill(0);
		const columnWidth = Math.max(200, ...noteIds.map((id) => widthOf(id)));
		for (let i = 0; i < noteIds.length; i++) {
			let col = 0;
			for (let c = 1; c < gridColumns; c++) {
				if (colHeights[c] < colHeights[col]) col = c;
			}
			const nw = widthOf(noteIds[i]);
			const h = heightOf(noteIds[i]);
			result.nodes[noteIds[i]] = {
				x: col * (columnWidth + nodeGap),
				y: colHeights[col],
				width: nw,
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

	const xSpec = dim["x-spectrum"] as Spectrum | undefined;
	const ySpec = dim["y-spectrum"] as Spectrum | undefined;
	const hasSpectra = !!xSpec || !!ySpec;

	if (hasSpectra) {
		return layoutWithSpectra(
			project,
			activeDimensionId,
			dim,
			buckets,
			ungrouped,
			xSpec ?? null,
			ySpec ?? null,
			nodeGap,
			groupGap,
			groupPadding,
			fonts,
			widthOf,
			measuredHeights,
		);
	}

	// ======================================================================
	// BFS ADJACENCY LAYOUT (no spectra)
	// ======================================================================
	const allGroupIds = dim.groups.map((g) => g.id);
	if (ungrouped.length) allGroupIds.push("__ungrouped");

	const connections = getConnectionsForDimension(project, activeDimensionId);
	const adj = buildGroupAdjacency(
		connections,
		project.notes,
		activeDimensionId,
		new Set(allGroupIds),
	);
	const placements = computeGroupPlacements(adj, allGroupIds);

	const minCol = Math.min(...[...placements.values()].map((p) => p.col));
	for (const p of placements.values()) p.col -= minCol;

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
		ids.sort((a, b) => placements.get(a)!.row - placements.get(b)!.row);
	}

	const sortedCols = [...columns.keys()].sort((a, b) => a - b);

	orderColumnsByConnections(columns, adj);

	// Find widest group in each column
	const colMaxWidth = new Map<number, number>();
	for (const [col, groupIds] of columns) {
		let maxW = DEFAULT_NODE_WIDTH + groupPadding * 2;
		for (const gid of groupIds) {
			const members = gid === "__ungrouped" ? ungrouped : buckets[gid] || [];
			maxW = Math.max(
				maxW,
				groupWidthForMembers(members, widthOf, groupPadding),
			);
		}
		colMaxWidth.set(col, maxW);
	}

	const colXOffset = new Map<number, number>();
	let xAccum = 0;
	for (const col of sortedCols) {
		colXOffset.set(col, xAccum);
		xAccum += colMaxWidth.get(col)! + groupGap;
	}

	for (const col of sortedCols) {
		const groupIds = columns.get(col)!;
		const x = colXOffset.get(col)!;
		const gw = colMaxWidth.get(col)!;
		let cursorY = 0;

		for (const groupId of groupIds) {
			const members =
				groupId === "__ungrouped" ? ungrouped : buckets[groupId] || [];
			const groupName =
				groupId === "__ungrouped"
					? "Ungrouped"
					: (dim.groups.find((g) => g.id === groupId)?.name ?? "");

			const gh = placeNodesInGroup(
				members,
				x,
				cursorY,
				nodeGap,
				groupPadding,
				gw,
				heightOf,
				widthOf,
				result,
			);

			result.groups[groupId] = {
				x,
				y: cursorY,
				width: gw,
				height: gh,
				name: groupName,
				complex: false,
			};
			result.groupBoxes.push({
				groupId,
				x,
				y: cursorY,
				width: gw,
				height: gh,
				name: groupName,
				xFrom: 0,
				xTo: 0,
				yFrom: 0,
				yTo: 0,
			});

			cursorY += gh + groupGap;
		}
	}

	return result;
}

// ---------------------------------------------------------------------------
// Spectrum layout
// ---------------------------------------------------------------------------

function layoutWithSpectra(
	project: ProjectData,
	dimId: string,
	dim: ProjectData["dimensions"][string],
	buckets: Record<string, string[]>,
	ungrouped: string[],
	xSpec: Spectrum | null,
	ySpec: Spectrum | null,
	nodeGap: number,
	groupGap: number,
	groupPadding: number,
	fonts: FontConfig,
	widthOf: (id: string) => number,
	measuredHeights: Record<string, number>,
): LayoutResult {
	const result: LayoutResult = { nodes: {}, groups: {}, groupBoxes: [] };

	/** Cached card height for this pass. */
	const heightCache = new Map<string, number>();

	function heightOf(id: string): number {
		const cached = heightCache.get(id);
		if (cached !== undefined) return cached;
		let height: number;
		if (measuredHeights[id] !== undefined) {
			height = measuredHeights[id];
		} else {
			const note = project.notes[id];
			const nw = widthOf(id);
			height = estimateNodeHeight(note.title, note.short, nw, fonts);
		}
		heightCache.set(id, height);
		return height;
	}

	function placeCellNodes(members: string[], x: number, startY: number): void {
		let cursor = startY;
		for (const id of members) {
			const nw = widthOf(id);
			const h = heightOf(id);
			result.nodes[id] = { x, y: cursor, width: nw, height: h };
			cursor += h + nodeGap;
		}
	}

	const xStops = xSpec ? xSpec.stops : null;
	const yStops = ySpec ? ySpec.stops : null;
	const xStopCount = xStops ? xStops.length : 1;
	const yStopCount = yStops ? yStops.length : 1;

	interface ResolvedGroup {
		id: string;
		name: string;
		members: string[];
		runs: GroupRun[];
		placed: boolean;
		complex: boolean;
		color?: string;
		colorKey?: string;
		membersByCell: Map<string, string[]>;
	}

	function indexCellKey(xi: number, yi: number): string {
		return `${xi},${yi}`;
	}

	// Resolve each group to one-axis runs and to per-cell member lists.
	const resolved: ResolvedGroup[] = [];
	for (const g of dim.groups) {
		const members = buckets[g.id] || [];
		const indices = cellsToIndices(g.cells, xStops, yStops);
		const placed = indices.length > 0;
		const runs = placed ? decomposeGroupRuns(indices) : [];
		const complex = runs.length > 1 || runs.some((run) => run.cells.length > 1);
		const membersByCell = new Map<string, string[]>();
		if (placed) {
			for (const noteId of members) {
				const placement = project.notes[noteId]?.placement?.[dimId];
				const cell = effectiveCellIndex(placement, indices, xStops, yStops);
				if (!cell) continue;
				const key = indexCellKey(cell.xi, cell.yi);
				const list = membersByCell.get(key) ?? [];
				list.push(noteId);
				membersByCell.set(key, list);
			}
		}
		resolved.push({
			id: g.id,
			name: g.name,
			members,
			runs,
			placed,
			complex,
			color: undefined,
			colorKey: g.color,
			membersByCell,
		});
	}

	// Color a complex group. An explicit color wins. Otherwise the name selects
	// the color. A duplicate auto name in one dimension gets an index.
	const groupNameUses = new Map<string, number>();
	for (const group of resolved) {
		if (!group.complex) continue;
		if (group.colorKey) {
			group.color = colorKeyToCss(group.colorKey);
			continue;
		}
		const key = group.name.trim().toLowerCase();
		const use = (groupNameUses.get(key) ?? 0) + 1;
		groupNameUses.set(key, use);
		group.color = `var(${groupColorVariable(
			use === 1 ? group.name : `${group.name} ${use}`,
		)})`;
	}

	if (ungrouped.length) {
		resolved.push({
			id: "__ungrouped",
			name: "Ungrouped",
			members: ungrouped,
			runs: [],
			placed: false,
			complex: false,
			membersByCell: new Map(),
		});
	}

	// Process connected groups one after another, so their boxes stack next to
	// each other. The stable order keeps disconnected groups as they are.
	const resolvedIds = resolved.map((group) => group.id);
	const groupAdjacency = buildGroupAdjacency(
		getConnectionsForDimension(project, dimId),
		project.notes,
		dimId,
		new Set(resolvedIds),
	);
	const groupOrder = new Map(
		orderGroupsByConnections(resolvedIds, groupAdjacency).map((id, index) => [
			id,
			index,
		]),
	);
	resolved.sort(
		(a, b) => (groupOrder.get(a.id) ?? 0) - (groupOrder.get(b.id) ?? 0),
	);

	// Vertical packing. A single-row box takes the lowest free span in its
	// columns. A multi-row box claims its cells and stays exclusive.
	const blockedCells = new Set<string>();
	const rowBoxes = new Map<number, PlacedBox[]>();
	const runOffset = new Map<string, number>();

	/** One box that the packing already placed in a row. */
	interface PlacedBox {
		row: number;
		xFrom: number;
		xTo: number;
		top: number;
		bottom: number;
	}

	function cellMembers(group: ResolvedGroup, c: number, r: number): string[] {
		return group.membersByCell.get(indexCellKey(c, r)) ?? [];
	}
	function cellStackHeight(members: string[]): number {
		if (members.length === 0) return 0;
		let total = 0;
		for (const id of members) total += heightOf(id) + nodeGap;
		return total - nodeGap;
	}
	function runKey(group: ResolvedGroup, run: GroupRun): string {
		return `${group.id}:${run.xFrom},${run.yFrom}`;
	}
	function runContentHeight(group: ResolvedGroup, run: GroupRun): number {
		let top = 0;
		for (const cell of run.cells) {
			top = Math.max(
				top,
				cellStackHeight(cellMembers(group, cell.xi, cell.yi)),
			);
		}
		return LABEL_H + groupPadding * 2 + top;
	}

	/**
	 * Return the lowest offset where every run fits in a row.
	 *
	 * Runs of one group never overlap in columns. The function gives them one
	 * offset, so the box chunks of a complex group start on the same line.
	 *
	 * @param row - The row index.
	 * @param runs - The horizontal runs of one group in this row.
	 * @param group - The group that owns the runs.
	 * @returns The lowest shared free offset from the row top.
	 */
	function offsetFreeForRuns(
		row: number,
		runs: GroupRun[],
		group: ResolvedGroup,
	): number {
		const boxes = rowBoxes.get(row);
		if (!boxes || boxes.length === 0) return 0;

		const candidates = new Set<number>([0]);
		for (const box of boxes) {
			if (runs.some((run) => box.xTo >= run.xFrom && box.xFrom <= run.xTo)) {
				candidates.add(box.bottom + groupGap);
			}
		}
		const sorted = [...candidates].sort((a, b) => a - b);
		for (const offset of sorted) {
			const fits = runs.every((run) => {
				const height = runContentHeight(group, run);
				return !boxes.some(
					(box) =>
						box.xTo >= run.xFrom &&
						box.xFrom <= run.xTo &&
						offset < box.bottom + groupGap &&
						offset + height > box.top,
				);
			});
			if (fits) return offset;
		}
		return sorted[sorted.length - 1];
	}

	/** Return true when a placed box covers one cell. */
	function cellTaken(row: number, col: number): boolean {
		const boxes = rowBoxes.get(row);
		if (!boxes) return false;
		return boxes.some((box) => box.xFrom <= col && col <= box.xTo);
	}

	for (const group of resolved) {
		if (!group.placed) continue;
		const addedBlocked: string[] = [];
		const addedRuns: string[] = [];
		const addedBoxes: PlacedBox[] = [];
		let conflict = false;
		const horizontalByRow = new Map<number, GroupRun[]>();

		for (const run of group.runs) {
			if (run.yFrom === run.yTo) {
				for (const cell of run.cells) {
					if (blockedCells.has(indexCellKey(cell.yi, cell.xi))) {
						conflict = true;
						break;
					}
				}
				if (conflict) break;
				const list = horizontalByRow.get(run.yFrom) ?? [];
				list.push(run);
				horizontalByRow.set(run.yFrom, list);
			} else {
				for (const cell of run.cells) {
					const key = indexCellKey(cell.yi, cell.xi);
					if (blockedCells.has(key) || cellTaken(cell.yi, cell.xi)) {
						conflict = true;
						break;
					}
				}
				if (conflict) break;
				for (const cell of run.cells) {
					const key = indexCellKey(cell.yi, cell.xi);
					blockedCells.add(key);
					addedBlocked.push(key);
				}
			}
		}

		if (conflict) {
			group.placed = false;
			for (const key of addedBlocked) blockedCells.delete(key);
			for (const key of addedRuns) runOffset.delete(key);
			continue;
		}

		for (const [row, runs] of horizontalByRow) {
			const offset = offsetFreeForRuns(row, runs, group);
			for (const run of runs) {
				const key = runKey(group, run);
				runOffset.set(key, offset);
				addedRuns.push(key);
				addedBoxes.push({
					row,
					xFrom: run.xFrom,
					xTo: run.xTo,
					top: offset,
					bottom: offset + runContentHeight(group, run),
				});
			}
		}

		for (const box of addedBoxes) {
			const boxes = rowBoxes.get(box.row);
			if (boxes) boxes.push(box);
			else rowBoxes.set(box.row, [box]);
		}
	}

	const placedGroups = resolved.filter((g) => g.placed);
	const unplacedGroups = resolved.filter((g) => !g.placed);

	const colW = new Array(xStopCount).fill(
		DEFAULT_NODE_WIDTH + groupPadding * 2,
	);
	for (const group of placedGroups) {
		for (const [key, members] of group.membersByCell) {
			const c = Number(key.split(",")[0]);
			let width = DEFAULT_NODE_WIDTH;
			for (const id of members) width = Math.max(width, widthOf(id));
			colW[c] = Math.max(colW[c], width + groupPadding * 2);
		}
	}

	const rowH = new Array(yStopCount).fill(LABEL_H + groupPadding * 2);
	for (const [row, boxes] of rowBoxes) {
		for (const box of boxes) {
			rowH[row] = Math.max(rowH[row], box.bottom);
		}
	}
	for (const group of placedGroups) {
		for (const run of group.runs) {
			if (run.yFrom === run.yTo) continue;
			for (const cell of run.cells) {
				rowH[cell.yi] = Math.max(
					rowH[cell.yi],
					cellStackHeight(cellMembers(group, cell.xi, cell.yi)) +
						groupPadding * 2,
				);
			}
			const topStack = cellStackHeight(
				cellMembers(group, run.xFrom, run.yFrom),
			);
			rowH[run.yFrom] = Math.max(
				rowH[run.yFrom],
				LABEL_H + groupPadding + topStack + groupPadding,
			);
		}
	}

	const SPECTRUM_MARGIN = 80;

	const colX: number[] = [];
	let cx = SPECTRUM_MARGIN;
	for (let c = 0; c < xStopCount; c++) {
		colX.push(cx);
		cx += colW[c] + groupGap;
	}

	const xExtent = cx - groupGap + SPECTRUM_MARGIN;
	const totalRowH =
		rowH.reduce((a, b) => a + b, 0) + (yStopCount - 1) * groupGap;
	const yExtent = Math.max(
		totalRowH + SPECTRUM_MARGIN * 2,
		LABEL_H + groupPadding * 2 + SPECTRUM_MARGIN * 2,
	);

	const rowY: number[] = [];
	let yAccum = SPECTRUM_MARGIN;
	for (let r = 0; r < yStopCount; r++) {
		rowY.push(yAccum);
		yAccum += rowH[r] + groupGap;
	}

	for (const group of placedGroups) {
		let primary: GroupBoxLayout | null = null;

		for (const run of group.runs) {
			if (run.yFrom === run.yTo) {
				const offset = runOffset.get(runKey(group, run)) ?? 0;
				const box: GroupBoxLayout = {
					groupId: group.id,
					name: group.name,
					color: group.color,
					x: colX[run.xFrom],
					y: rowY[run.yFrom] + offset,
					width: colX[run.xTo] + colW[run.xTo] - colX[run.xFrom],
					height: runContentHeight(group, run),
					xFrom: run.xFrom,
					xTo: run.xTo,
					yFrom: run.yFrom,
					yTo: run.yTo,
				};
				result.groupBoxes.push(box);
				if (!primary) primary = box;
				for (const cell of run.cells) {
					const members = cellMembers(group, cell.xi, cell.yi);
					if (members.length === 0) continue;
					placeCellNodes(
						members,
						colX[cell.xi] + groupPadding,
						box.y + LABEL_H + groupPadding,
					);
				}
			} else {
				const box: GroupBoxLayout = {
					groupId: group.id,
					name: group.name,
					color: group.color,
					x: colX[run.xFrom],
					y: rowY[run.yFrom],
					width: colW[run.xFrom],
					height: rowY[run.yTo] + rowH[run.yTo] - rowY[run.yFrom],
					xFrom: run.xFrom,
					xTo: run.xTo,
					yFrom: run.yFrom,
					yTo: run.yTo,
				};
				result.groupBoxes.push(box);
				if (!primary) primary = box;
				for (const cell of run.cells) {
					const members = cellMembers(group, cell.xi, cell.yi);
					if (members.length === 0) continue;
					const startY =
						rowY[cell.yi] +
						(cell.yi === run.yFrom ? LABEL_H + groupPadding : groupPadding);
					placeCellNodes(members, colX[cell.xi] + groupPadding, startY);
				}
			}
		}

		if (primary) {
			result.groups[group.id] = {
				x: primary.x,
				y: primary.y,
				width: primary.width,
				height: primary.height,
				name: group.name,
				complex: group.complex,
				color: group.color,
			};
		}
	}

	let unplacedY = yAccum + groupGap;
	let unplacedX = SPECTRUM_MARGIN;
	for (const group of unplacedGroups) {
		const gw = groupWidthForMembers(group.members, widthOf, groupPadding);
		const gh = placeNodesInGroup(
			group.members,
			unplacedX,
			unplacedY,
			nodeGap,
			groupPadding,
			gw,
			heightOf,
			widthOf,
			result,
		);

		result.groups[group.id] = {
			x: unplacedX,
			y: unplacedY,
			width: gw,
			height: gh,
			name: group.name,
			complex: false,
		};
		result.groupBoxes.push({
			groupId: group.id,
			x: unplacedX,
			y: unplacedY,
			width: gw,
			height: gh,
			name: group.name,
			xFrom: 0,
			xTo: 0,
			yFrom: 0,
			yTo: 0,
		});

		unplacedX += gw + groupGap;
		if (unplacedX > xExtent - gw) {
			unplacedX = SPECTRUM_MARGIN;
			unplacedY += gh + groupGap;
		}
	}

	if (xSpec) {
		result.xSpectrum = {
			name: xSpec.name,
			poles: xSpec.poles,
			stops: xSpec.stops.map((name, i) => ({
				name,
				position: colX[i] + colW[i] / 2,
			})),
			extent: xExtent,
		};
	}

	if (ySpec) {
		result.ySpectrum = {
			name: ySpec.name,
			poles: ySpec.poles,
			stops: ySpec.stops.map((name, i) => ({
				name,
				position: rowY[i] + rowH[i] / 2,
			})),
			extent: yExtent,
		};
	}

	return result;
}
