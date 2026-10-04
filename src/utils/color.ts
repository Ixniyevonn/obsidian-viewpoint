/** Color variables that Obsidian supplies for every theme. */
const COLOR_VARIABLES = [
	"--color-red",
	"--color-orange",
	"--color-yellow",
	"--color-green",
	"--color-cyan",
	"--color-blue",
	"--color-purple",
	"--color-pink",
];

/** The color keys that a group or tag can use. */
export const GROUP_COLOR_KEYS = [
	"red",
	"orange",
	"yellow",
	"green",
	"cyan",
	"blue",
	"purple",
	"pink",
];

/**
 * Return the CSS color variable for a color key.
 *
 * @param key - A color key, such as `red`.
 * @returns The CSS variable name, such as `--color-red`.
 */
export function colorKeyToVariable(key: string): string {
	return `--color-${key}`;
}

/**
 * Return a stable color variable for a seed string.
 *
 * The function hashes the lowercase seed. The same seed always gives the same
 * color in every view.
 *
 * @param seed - The text that selects the color.
 * @returns A CSS color variable name, such as `--color-blue`.
 */
export function hashColorVariable(seed: string): string {
	const key = seed.toLowerCase();
	let hash = 2166136261;
	for (let i = 0; i < key.length; i++) {
		hash ^= key.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return COLOR_VARIABLES[(hash >>> 0) % COLOR_VARIABLES.length];
}

/**
 * Return the color variable for a group.
 *
 * The function hashes the color seed, which is based on the group name. The
 * same name gives the same color. The caller appends an index for a duplicate
 * name, so different groups still differ.
 *
 * @param seed - The group name, or a name with a duplicate index.
 * @returns A CSS color variable name.
 */
export function groupColorVariable(seed: string): string {
	return hashColorVariable(seed);
}
