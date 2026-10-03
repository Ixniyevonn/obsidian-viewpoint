import { expect, test } from "bun:test";
import {
    contiguousGroupRuns,
    enforceSingleAxisSpan,
    groupStopIndices,
    groupStopSetFromIndices,
    nearestStopIndex,
    normalizeGroupStopSet,
    shiftGroupStopSet,
    toggleGroupStopRun,
} from "./groupStops";

const stops = ["rebel", "neutral", "loyalist", "crown"];

test("stop sets keep known stops in spectrum order", () => {
    expect(groupStopIndices("neutral", stops)).toEqual([1]);
    expect(groupStopIndices(["crown", "rebel", "rebel"], stops)).toEqual([0, 3]);
    expect(groupStopIndices(["missing", "neutral"], stops)).toEqual([1]);
    expect(groupStopIndices(null, stops)).toEqual([]);
    expect(groupStopIndices("rebel", null)).toEqual([]);
});

test("a stop set collapses to a name when it has one stop", () => {
    expect(groupStopSetFromIndices([1], stops)).toBe("neutral");
    expect(groupStopSetFromIndices([3, 0], stops)).toEqual(["rebel", "crown"]);
    expect(groupStopSetFromIndices([9], stops)).toBeNull();
    expect(normalizeGroupStopSet(["crown", "rebel"], stops)).toEqual([
        "rebel",
        "crown",
    ]);
});

test("contiguous runs merge adjacent stops", () => {
    expect(contiguousGroupRuns([0, 1, 2, 4])).toEqual([
        { from: 0, to: 2 },
        { from: 4, to: 4 },
    ]);
    expect(contiguousGroupRuns([])).toEqual([]);
});

test("the nearest allowed stop breaks a tie toward the earlier stop", () => {
    expect(nearestStopIndex(2, [0, 3])).toBe(3);
    expect(nearestStopIndex(2, [1, 3])).toBe(1);
    expect(nearestStopIndex(2, [])).toBe(-1);
});

test("toggling a run adds, removes, and splits stops", () => {
    expect(toggleGroupStopRun("rebel", stops, 0, 2)).toEqual([
        "rebel",
        "neutral",
        "loyalist",
    ]);
    expect(
        toggleGroupStopRun(["rebel", "neutral", "loyalist"], stops, 1, 2),
    ).toBe("rebel");
    expect(
        toggleGroupStopRun(["rebel", "neutral", "loyalist"], stops, 1, 1),
    ).toEqual(["rebel", "loyalist"]);
    expect(toggleGroupStopRun(["rebel", "neutral", "loyalist"], stops, 0, 2)).toBe(
        "loyalist",
    );
});

test("moving a stop set keeps its span length and clamps at the ends", () => {
    expect(shiftGroupStopSet("neutral", stops, "neutral", "crown")).toBe("crown");
    expect(
        shiftGroupStopSet(["rebel", "neutral"], stops, "rebel", "loyalist"),
    ).toEqual(["loyalist", "crown"]);
    expect(
        shiftGroupStopSet(["rebel", "neutral"], stops, "rebel", "rebel"),
    ).toEqual(["rebel", "neutral"]);
    expect(
        shiftGroupStopSet(["loyalist", "crown"], stops, "loyalist", "neutral"),
    ).toEqual(["neutral", "loyalist"]);
});

test("the one axis span rule keeps the larger span and X on a tie", () => {
    expect(
        enforceSingleAxisSpan(
            ["rebel", "neutral", "loyalist", "crown"],
            ["neutral", "loyalist"],
            stops,
            stops,
        ),
    ).toEqual([["rebel", "neutral", "loyalist", "crown"], "neutral"]);
    expect(
        enforceSingleAxisSpan(
            ["rebel", "neutral"],
            ["loyalist", "crown"],
            stops,
            stops,
        ),
    ).toEqual([["rebel", "neutral"], "loyalist"]);
    expect(enforceSingleAxisSpan("rebel", "crown", stops, stops)).toEqual([
        "rebel",
        "crown",
    ]);
});
