/**
 * Markdown characters that change the rendered output.
 *
 * The set covers links, emphasis, code, headings, tables, quotes, HTML,
 * escapes, math, comments, and highlights.
 */
const MARKDOWN_SYNTAX = /[[\]()*_`~#>|<&=%$\\\r\n\t]/;

/** A list marker at the start of a line, or a thematic break. */
const BLOCK_START = /^\s*(?:[-+*]\s|\d+[.)]\s|-{3,}\s*$)/;

/**
 * Return true when Markdown adds no structure to a text.
 *
 * A plain text needs no Markdown renderer. The test is conservative: a text
 * with a special character uses the renderer.
 *
 * @param markdown - The text to examine.
 * @returns True when the text has no Markdown syntax.
 */
export function isPlainText(markdown: string): boolean {
	if (!markdown) return true;
	if (MARKDOWN_SYNTAX.test(markdown)) return false;
	if (BLOCK_START.test(markdown)) return false;
	return true;
}
