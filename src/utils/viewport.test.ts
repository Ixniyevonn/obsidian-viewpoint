import { expect, test } from "bun:test";
import { rectsIntersect, viewportRect, type Viewport } from "./viewport";

const base: Viewport = { panX: 0, panY: 0, zoom: 1, width: 800, height: 600 };

test("the view rectangle has no margin at zero", () => {
	const rect = viewportRect(base, 0);
	expect(rect).not.toBeNull();
	expect(rect).toEqual({ x0: 0, y0: 0, x1: 800, y1: 600 });
});

test("the view rectangle follows the pan and zoom", () => {
	const rect = viewportRect({ ...base, panX: -400, panY: -200, zoom: 2 }, 0);
	expect(rect).toEqual({ x0: 200, y0: 100, x1: 600, y1: 400 });
});

test("the margin grows the view rectangle", () => {
	const rect = viewportRect(base, 0.5);
	expect(rect).toEqual({ x0: -400, y0: -300, x1: 1200, y1: 900 });
});

test("an unknown size gives no view rectangle", () => {
	expect(viewportRect({ ...base, width: 0 })).toBeNull();
	expect(viewportRect({ ...base, height: 0 })).toBeNull();
});

test("rectsIntersect finds touching items", () => {
	const rect = { x0: 0, y0: 0, x1: 100, y1: 100 };
	expect(rectsIntersect(rect, 50, 50, 40, 40)).toBe(true);
	expect(rectsIntersect(rect, -20, 50, 40, 40)).toBe(true);
	expect(rectsIntersect(rect, 101, 0, 40, 40)).toBe(false);
	expect(rectsIntersect(rect, 0, -41, 40, 40)).toBe(false);
});
