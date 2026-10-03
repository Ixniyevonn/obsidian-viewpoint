import { expect, test } from "bun:test";
import {
    cellsToIndices,
    decomposeGroupRuns,
    effectiveCellIndex,
    indicesToCells,
    normalizeGroupCells,
    resizeRunCells,
    shiftRunCells,
} from "./groupStops";

const xStops = ["a", "b", "c", "d"];
const yStops = ["m", "n", "o"];

test("cells keep known stops and drop duplicates", () => {
    expect(
        normalizeGroupCells(
            [
                { x: "a", y: "m" },
                { x: "a", y: "m" },
                { x: "z", y: "m" },
            ],
            xStops,
            yStops,
        ),
    ).toEqual([{ x: "a", y: "m" }]);
    expect(normalizeGroupCells([{ x: null, y: "m" }], xStops, yStops)).toEqual(
        [],
    );
});

test("cells decompose into one-axis runs", () => {
    const horizontal = decomposeGroupRuns([
        { xi: 0, yi: 0 },
        { xi: 1, yi: 0 },
        { xi: 2, yi: 0 },
    ]);
    expect(horizontal).toEqual([
        {
            xFrom: 0,
            xTo: 2,
            yFrom: 0,
            yTo: 0,
            cells: [
                { xi: 0, yi: 0 },
                { xi: 1, yi: 0 },
                { xi: 2, yi: 0 },
            ],
        },
    ]);

    const vertical = decomposeGroupRuns([
        { xi: 1, yi: 0 },
        { xi: 1, yi: 1 },
    ]);
    expect(vertical).toEqual([
        {
            xFrom: 1,
            xTo: 1,
            yFrom: 0,
            yTo: 1,
            cells: [
                { xi: 1, yi: 0 },
                { xi: 1, yi: 1 },
            ],
        },
    ]);

    expect(decomposeGroupRuns([{ xi: 3, yi: 2 }]).length).toBe(1);
});

test("moving a run shifts only its cells", () => {
    const indices = [
        { xi: 0, yi: 0 },
        { xi: 3, yi: 2 },
    ];
    const run = decomposeGroupRuns(indices).find(
        (item) => item.xFrom === 0 && item.yFrom === 0,
    )!;
    expect(shiftRunCells(indices, run, 1, 0, 4, 3)).toEqual([
        { xi: 3, yi: 2 },
        { xi: 1, yi: 0 },
    ]);
    expect(shiftRunCells(indices, run, 9, 0, 4, 3)).toEqual([
        { xi: 3, yi: 2 },
        { xi: 3, yi: 0 },
    ]);
});

test("resizing a run extends and shrinks it", () => {
    const indices = [
        { xi: 1, yi: 0 },
        { xi: 3, yi: 2 },
    ];
    const run = decomposeGroupRuns(indices).find(
        (item) => item.xFrom === 1 && item.yFrom === 0,
    )!;
    expect(resizeRunCells(indices, run, "x", "max", 3)).toEqual([
        { xi: 3, yi: 2 },
        { xi: 1, yi: 0 },
        { xi: 2, yi: 0 },
        { xi: 3, yi: 0 },
    ]);
    expect(resizeRunCells(indices, run, "x", "max", 1)).toEqual([
        { xi: 3, yi: 2 },
        { xi: 1, yi: 0 },
    ]);
});

test("a missing placement axis keeps the note in its first cell", () => {
    // Cells A2(0,1), A1(0,0), B1(1,0), in that order.
    const indices = [
        { xi: 0, yi: 1 },
        { xi: 0, yi: 0 },
        { xi: 1, yi: 0 },
    ];
    expect(effectiveCellIndex(undefined, indices, xStops, yStops)).toEqual({
        xi: 0,
        yi: 1,
    });
    expect(
        effectiveCellIndex({ x: "a" }, indices, xStops, yStops),
    ).toEqual({ xi: 0, yi: 1 });
    expect(
        effectiveCellIndex({ y: "o" }, indices, xStops, yStops),
    ).toEqual({ xi: 0, yi: 1 });
});

test("index cells round-trip to names", () => {
    expect(indicesToCells([{ xi: 0, yi: 1 }], xStops, yStops)).toEqual([
        { x: "a", y: "n" },
    ]);
    expect(cellsToIndices([{ x: "d", y: "o" }], xStops, yStops)).toEqual([
        { xi: 3, yi: 2 },
    ]);
});
