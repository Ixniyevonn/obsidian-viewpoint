import { expect, test } from "bun:test";
import {
	GROUP_COLOR_KEYS,
	GROUP_COLOR_OPTIONS,
	colorKeyToCss,
	isGroupColorKey,
} from "./color";

test("preset keys resolve to theme variables and soft tones", () => {
	expect(colorKeyToCss("red")).toBe("var(--color-red)");
	const soft = colorKeyToCss("red-soft");
	expect(soft).toContain("var(--color-red)");
	expect(soft).toContain("color-mix(");
	expect(soft).toContain("var(--background-primary)");
});

test("a custom color passes through unchanged", () => {
	expect(colorKeyToCss("#3b82f6")).toBe("#3b82f6");
	expect(isGroupColorKey("#3b82f6")).toBe(false);
});

test("the popover holds each hue and its soft tone", () => {
	expect(GROUP_COLOR_KEYS).toHaveLength(16);
	expect(GROUP_COLOR_OPTIONS).toHaveLength(16);
	expect(isGroupColorKey("pink-soft")).toBe(true);
	expect(isGroupColorKey("Automatic")).toBe(false);
});
