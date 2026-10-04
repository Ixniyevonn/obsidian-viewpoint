import { expect, test } from "bun:test";
import {
	collectTagSuggestions,
	tagColorVariable,
	tagNameFromMarkdown,
} from "./tags";

test("tag names keep visible text and drop link formatting", () => {
	expect(tagNameFromMarkdown("[[Demo Notes]]")).toBe("Demo Notes");
	expect(tagNameFromMarkdown("[[Demo Notes#Fire magic|Fire]]")).toBe("Fire");
	expect(tagNameFromMarkdown("[[folder/Demo Notes]]")).toBe("Demo Notes");
	expect(tagNameFromMarkdown("[Fire](Demo%20Notes.md#Fire%20magic)")).toBe(
		"Fire",
	);
	expect(tagNameFromMarkdown("[Demo Notes](Demo%20Notes.md)")).toBe(
		"Demo Notes",
	);
	expect(tagNameFromMarkdown("**Fire** and `ice`")).toBe("Fire and ice");
	expect(tagNameFromMarkdown("  plain  ")).toBe("plain");
});

test("tag colors stay stable for the same visible name", () => {
	const first = tagColorVariable("[[Demo Notes#Fire magic|Fire]]");
	expect(first).toBe(tagColorVariable("Fire"));
	expect(first.startsWith("--color-")).toBe(true);
	expect(first).toBe(tagColorVariable("[Fire](Demo%20Notes.md)"));
});

test("tag suggestions keep one raw tag for each visible name", () => {
	const base = {
		title: "",
		short: "",
		long: "",
		membership: {},
		connections: {},
	};
	const notes = {
		a: { ...base, tags: ["[[Fire|Flame]]", "[[Ice]]"] },
		b: { ...base, tags: ["Flame", "[Ice](Ice.md)"] },
		c: base,
	};
	expect(collectTagSuggestions(notes)).toEqual(["[[Fire|Flame]]", "[[Ice]]"]);
});
