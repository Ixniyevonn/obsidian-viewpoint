/**
 * Build a map from old spectrum stop names to renamed stop names.
 *
 * The function compares the stops by position. A stop is a rename when two
 * conditions hold. Its old name is absent from the new stops. The new name at
 * the same position is absent from the old stops. A reorder does not make a
 * mapping.
 *
 * @param oldStops - The stop names before the edit. Use undefined when the axis had no spectrum.
 * @param newStops - The stop names after the edit. Use undefined when the axis has no spectrum.
 * @returns A map from each renamed old name to its new name. The map is empty
 *   when no name changed.
 */
export function spectrumStopRenameMap(
	oldStops: string[] | undefined,
	newStops: string[] | undefined,
): Map<string, string> {
	const rename = new Map<string, string>();
	if (!oldStops || !newStops) return rename;

	const oldSet = new Set(oldStops);
	const newSet = new Set(newStops);
	const count = Math.min(oldStops.length, newStops.length);

	for (let i = 0; i < count; i++) {
		const from = oldStops[i];
		const to = newStops[i];
		if (from === to) continue;
		if (newSet.has(from)) continue;
		if (oldSet.has(to)) continue;
		rename.set(from, to);
	}

	return rename;
}
