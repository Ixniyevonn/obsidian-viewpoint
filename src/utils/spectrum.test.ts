import { expect, test } from "bun:test";
import { spectrumStopRenameMap } from "./spectrum";

test("stop rename maps an edited name to its new name", () => {
	const rename = spectrumStopRenameMap(
		["rebel", "neutral", "loyalist"],
		["rebel", "centre", "loyalist"],
	);
	expect([...rename.entries()]).toEqual([["neutral", "centre"]]);
});

test("stop reorder makes no mapping", () => {
	const rename = spectrumStopRenameMap(["a", "b", "c"], ["c", "a", "b"]);
	expect(rename.size).toBe(0);
});

test("stop add and remove make no mapping", () => {
	expect(spectrumStopRenameMap(["a", "b"], ["a", "b", "c"]).size).toBe(0);
	expect(spectrumStopRenameMap(["a", "b"], ["a"]).size).toBe(0);
});

test("stop rename after a reorder still maps the changed name", () => {
	const rename = spectrumStopRenameMap(
		["rebel", "neutral", "loyalist"],
		["loyalist", "centre", "rebel"],
	);
	expect([...rename.entries()]).toEqual([["neutral", "centre"]]);
});

test("missing spectra make no mapping", () => {
	expect(spectrumStopRenameMap(undefined, ["a"]).size).toBe(0);
	expect(spectrumStopRenameMap(["a"], undefined).size).toBe(0);
});
