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
 * The function hashes the group ID, not the group name. Two groups with the
 * same name thus get different colors.
 *
 * @param groupId - The stable group ID.
 * @returns A CSS color variable name.
 */
export function groupColorVariable(groupId: string): string {
    return hashColorVariable(groupId);
}
