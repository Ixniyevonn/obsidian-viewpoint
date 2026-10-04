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

/** The hue keys that Obsidian supplies as theme color variables. */
const GROUP_COLOR_HUES = [
	"red",
	"orange",
	"yellow",
	"green",
	"cyan",
	"blue",
	"purple",
	"pink",
];

/** The suffix of a soft tone. */
const GROUP_COLOR_SOFT_SUFFIX = "-soft";

/** The part of the hue that a soft tone keeps. The rest is the theme background. */
const SOFT_TONE_PERCENT = 45;

/** The color keys that a group can use. The list holds each hue and its soft tone. */
export const GROUP_COLOR_KEYS = GROUP_COLOR_HUES.flatMap((hue) => [
	hue,
	`${hue}${GROUP_COLOR_SOFT_SUFFIX}`,
]);

/** One color in the group color popover. */
export interface GroupColorOption {
	/** The value that the project file stores. */
	key: string;
	/** The text that the popover shows. */
	label: string;
	/** The CSS value that paints the color. */
	css: string;
}

/** The selectable group colors. Each hue has a normal tone and a soft tone. */
export const GROUP_COLOR_OPTIONS: GroupColorOption[] = GROUP_COLOR_HUES.flatMap(
	(hue) => {
		const soft = `${hue}${GROUP_COLOR_SOFT_SUFFIX}`;
		return [
			{ key: hue, label: hue, css: colorKeyToCss(hue) },
			{ key: soft, label: `${hue} soft`, css: colorKeyToCss(soft) },
		];
	},
);

/**
 * Return the CSS color variable for a color key.
 *
 * @param key - A color key, such as `red`.
 * @returns The CSS variable name, such as `--color-red`.
 */
export function colorKeyToVariable(key: string): string {
	return `--color-${key}`;
}

/** Return true when a hue has an Obsidian theme color variable. */
function isThemeHue(hue: string): boolean {
	return COLOR_VARIABLES.includes(colorKeyToVariable(hue));
}

/**
 * Return true when a value is a preset group color key.
 *
 * @param value - The value to examine.
 * @returns True for a key in GROUP_COLOR_KEYS.
 */
export function isGroupColorKey(value: string | null | undefined): boolean {
	return !!value && GROUP_COLOR_KEYS.includes(value);
}

/**
 * Return the CSS value for a stored group color.
 *
 * A preset key becomes a theme variable or a soft color-mix. Any other value
 * is a custom CSS color and passes through.
 *
 * @param value - The stored group color.
 * @returns A CSS color value.
 */
export function colorKeyToCss(value: string): string {
	if (value.endsWith(GROUP_COLOR_SOFT_SUFFIX)) {
		const hue = value.slice(0, -GROUP_COLOR_SOFT_SUFFIX.length);
		if (isThemeHue(hue)) {
			return `color-mix(in srgb, var(${colorKeyToVariable(hue)}) ${SOFT_TONE_PERCENT}%, var(--background-primary))`;
		}
		return value;
	}
	if (isThemeHue(value)) {
		return `var(${colorKeyToVariable(value)})`;
	}
	return value;
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
