import { expect, test } from "bun:test";
import { collectConnectedCluster } from "./connections";

test("a cluster follows connections in both directions", () => {
	const connections = [
		{ from: "a", to: "b" },
		{ from: "b", to: "c" },
		{ from: "d", to: "e" },
	];
	expect(collectConnectedCluster(connections, "a")).toEqual(
		new Set(["a", "b", "c"]),
	);
	expect(collectConnectedCluster(connections, "c")).toEqual(
		new Set(["a", "b", "c"]),
	);
	expect(collectConnectedCluster(connections, "d")).toEqual(
		new Set(["d", "e"]),
	);
});

test("an isolated note has a cluster of itself", () => {
	expect(collectConnectedCluster([], "solo")).toEqual(new Set(["solo"]));
});

test("a self-loop does not add other notes", () => {
	const connections = [{ from: "a", to: "a" }];
	expect(collectConnectedCluster(connections, "a")).toEqual(new Set(["a"]));
});

test("the cluster stops at a break in the chain", () => {
	const connections = [
		{ from: "a", to: "b" },
		{ from: "c", to: "d" },
	];
	expect(collectConnectedCluster(connections, "a")).toEqual(
		new Set(["a", "b"]),
	);
});
