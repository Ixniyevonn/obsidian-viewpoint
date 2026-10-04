/** One connection between two notes. */
export interface ConnectionPair {
	from: string;
	to: string;
}

/**
 * Return the notes in the connected cluster of a start note.
 *
 * The function treats every connection as undirected. The result holds the
 * start note and every note that a chain of connections can reach from it.
 *
 * @param connections - The connections to examine.
 * @param startId - The note to start from.
 * @returns The note IDs in the same cluster.
 */
export function collectConnectedCluster(
	connections: ConnectionPair[],
	startId: string,
): Set<string> {
	const adjacency = new Map<string, string[]>();

	/** Add one end of a connection to the adjacency list. */
	function link(from: string, to: string) {
		const list = adjacency.get(from) ?? [];
		list.push(to);
		adjacency.set(from, list);
	}

	for (const connection of connections) {
		if (connection.from === connection.to) {
			if (!adjacency.has(connection.from)) {
				adjacency.set(connection.from, []);
			}
			continue;
		}
		link(connection.from, connection.to);
		link(connection.to, connection.from);
	}

	const cluster = new Set<string>([startId]);
	const queue = [startId];
	while (queue.length > 0) {
		const id = queue.pop();
		if (id === undefined) break;
		for (const next of adjacency.get(id) ?? []) {
			if (cluster.has(next)) continue;
			cluster.add(next);
			queue.push(next);
		}
	}
	return cluster;
}
