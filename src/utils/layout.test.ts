import { expect, test } from "bun:test";
import type { Group, GroupCell, Note, ProjectData } from "../types";
import { layoutEngine, orderColumnsByConnections } from "./layout";

// pretext measures text with a canvas context. Bun has no canvas, so use a
// fixed-width stub for the layout tests.
class FakeCanvasContext {
	font = "";
	measureText(text: string): { width: number } {
		return { width: text.length * 8 };
	}
}
class FakeOffscreenCanvas {
	getContext(): FakeCanvasContext {
		return new FakeCanvasContext();
	}
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas =
	FakeOffscreenCanvas;

function makeNote(
	membership: Record<string, string | null>,
	placement?: Record<string, { x?: string; y?: string }>,
): Note {
	return {
		title: "N",
		short: "",
		long: "",
		membership,
		connections: {},
		placement,
	};
}

const cell = (x: string | null, y: string | null = null): GroupCell => ({
	x,
	y,
});

function makeProject(groups: Group[]): ProjectData {
	return {
		meta: { name: "T", created: "", modified: "" },
		dimensions: {
			d: {
				name: "D",
				"x-spectrum": {
					name: "X",
					poles: ["left", "right"],
					stops: ["a", "b", "c", "d"],
				},
				groups,
			},
		},
		notes: {
			n1: makeNote({ d: "span" }, { d: { x: "a" } }),
			n2: makeNote({ d: "span" }, { d: { x: "c" } }),
			n3: makeNote({ d: "point" }),
		},
		node_order: {},
	};
}

test("a contiguous X run makes one box across its stops", () => {
	const layout = layoutEngine(
		makeProject([
			{ id: "span", name: "Span", cells: [cell("a"), cell("b"), cell("c")] },
			{ id: "point", name: "Point", cells: [cell("d")] },
		]),
		"d",
	);
	const boxes = layout.groupBoxes.filter((box) => box.groupId === "span");
	expect(boxes.length).toBe(1);
	const box = boxes[0];
	expect(box.width).toBeGreaterThan(layout.groups.point.width);
	expect(layout.nodes.n1.x).toBeLessThan(layout.nodes.n2.x);
	expect(layout.nodes.n2.x).toBeLessThan(box.x + box.width);
});

test("a detached cell set makes one box for each run", () => {
	const layout = layoutEngine(
		makeProject([
			{ id: "span", name: "Span", cells: [cell("a"), cell("c")] },
			{ id: "point", name: "Point", cells: [cell("d")] },
		]),
		"d",
	);
	expect(layout.groupBoxes.filter((box) => box.groupId === "span").length).toBe(
		2,
	);
	expect(layout.groups.span.complex).toBe(true);
	expect(layout.groups.point.complex).toBe(false);
});

test("detached chunks of one group align on one line", () => {
	const layout = layoutEngine(
		makeProject([
			{ id: "point", name: "Point", cells: [cell("a")] },
			{ id: "span", name: "Span", cells: [cell("a"), cell("c")] },
		]),
		"d",
	);
	const spanBoxes = layout.groupBoxes.filter((box) => box.groupId === "span");
	expect(spanBoxes.length).toBe(2);
	expect(spanBoxes[0].y).toBe(spanBoxes[1].y);
});

test("connected groups order by their neighbors in the left column", () => {
	const columns = new Map<number, string[]>([
		[0, ["b", "a"]],
		[1, ["x", "y"]],
	]);
	const adj = new Map<string, Set<string>>([
		["a", new Set(["x"])],
		["b", new Set(["y"])],
		["x", new Set(["a"])],
		["y", new Set(["b"])],
	]);
	orderColumnsByConnections(columns, adj);
	expect(columns.get(0)).toEqual(["b", "a"]);
	expect(columns.get(1)).toEqual(["y", "x"]);
});

test("two point groups in one cell stack", () => {
	const layout = layoutEngine(
		makeProject([
			{ id: "g1", name: "G1", cells: [cell("a")] },
			{ id: "g2", name: "G2", cells: [cell("a")] },
		]),
		"d",
	);
	expect(layout.groups.g2.y).toBeGreaterThan(layout.groups.g1.y);
});

test("a point group stacks below a span that shares its stop", () => {
	const layout = layoutEngine(
		makeProject([
			{ id: "span", name: "Span", cells: [cell("a"), cell("b")] },
			{ id: "point", name: "Point", cells: [cell("b")] },
		]),
		"d",
	);
	const spanBox = layout.groupBoxes.find((box) => box.groupId === "span");
	const pointBox = layout.groupBoxes.find((box) => box.groupId === "point");
	expect(spanBox).toBeDefined();
	expect(pointBox).toBeDefined();
	expect(pointBox!.y).toBeGreaterThanOrEqual(spanBox!.y + spanBox!.height);
});

test("a single-row span keeps its own height in a tall row", () => {
	const layout = layoutEngine(
		makeProject([
			{ id: "span", name: "Span", cells: [cell("a"), cell("b")] },
			{ id: "point", name: "Point", cells: [cell("d")] },
		]),
		"d",
		{ measuredHeights: { n3: 1000 } },
	);
	const spanBox = layout.groupBoxes.find((box) => box.groupId === "span");
	const pointBox = layout.groupBoxes.find((box) => box.groupId === "point");
	expect(spanBox).toBeDefined();
	expect(pointBox).toBeDefined();
	expect(spanBox!.height).toBeLessThan(pointBox!.height);
});

test("a chain of complex groups fills the free space above them", () => {
	const layout = layoutEngine(
		makeProject([
			{ id: "A", name: "A", cells: [cell("a")] },
			{ id: "AB", name: "AB", cells: [cell("a"), cell("b")] },
			{ id: "BC", name: "BC", cells: [cell("b"), cell("c")] },
			{ id: "C", name: "C", cells: [cell("c")] },
		]),
		"d",
	);
	// A and BC share the top level. AB and C share the next level.
	expect(layout.groups.AB.y).toBe(layout.groups.C.y);
	expect(layout.groups.BC.y).toBe(layout.groups.A.y);
	expect(layout.groups.AB.y).toBeGreaterThan(layout.groups.A.y);
});

test("an explicit color wins and duplicate names differ", () => {
	const layout = layoutEngine(
		makeProject([
			{ id: "g1", name: "Twin", cells: [cell("a"), cell("b")] },
			{ id: "g2", name: "Twin", cells: [cell("c"), cell("d")] },
			{
				id: "solo",
				name: "Solo",
				cells: [cell("a"), cell("b")],
				color: "red",
			},
			{
				id: "soft",
				name: "Soft",
				cells: [cell("a"), cell("b")],
				color: "green-soft",
			},
			{
				id: "custom",
				name: "Custom",
				cells: [cell("a"), cell("b")],
				color: "#123456",
			},
		]),
		"d",
	);
	expect(layout.groups.g1.color).toBeDefined();
	expect(layout.groups.g2.color).toBeDefined();
	expect(layout.groups.g1.color).not.toBe(layout.groups.g2.color);
	expect(layout.groups.solo.color).toBe("var(--color-red)");
	expect(layout.groups.soft.color).toContain("var(--color-green)");
	expect(layout.groups.soft.color).toContain("color-mix(");
	expect(layout.groups.custom.color).toBe("#123456");
});
