import { expect, test } from "bun:test";
import { automaticNodeWidth, noteWidth, snapNodeWidth } from "./nodeWidth";

test("automatic widths grow and shrink at the text boundaries", () => {
    for (const [length, width] of [[0, 200], [120, 200], [121, 320], [300, 320], [301, 440]]) {
        expect(automaticNodeWidth({ title: "", short: "a".repeat(length) })).toBe(width);
    }
    expect(automaticNodeWidth({ title: "", short: `[[${"a".repeat(400)}|short]]` })).toBe(200);
});

test("manual widths override automatic sizing, including the old default", () => {
    const note = { title: "Title", short: "a".repeat(400), long: "", membership: {}, connections: {} };
    expect(noteWidth(note)).toBe(440);
    expect(noteWidth({ ...note, width: 200 })).toBe(200);
    expect(noteWidth({ ...note, width: 800 })).toBe(600);
});

test("resize snaps to the nearest candidate within eight screen pixels", () => {
    expect(snapNodeWidth(315, [200, 320, 440])).toBe(320);
    expect(snapNodeWidth(305, [320])).toBe(305);
    expect(snapNodeWidth(305, [320], 0.5)).toBe(320);
    expect(snapNodeWidth(315, [320], 2)).toBe(315);
    expect(snapNodeWidth(315, [])).toBe(315);
    expect(snapNodeWidth(800, [])).toBe(600);
});
