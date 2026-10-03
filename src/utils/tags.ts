import type { Note } from "../types";
import { hashColorVariable } from "./color";

const WIKI_LINK = /\[\[([^\]|#]*)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;
const MARKDOWN_LINK = /\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * Return the file name from a link target.
 *
 * The function decodes the target, removes the heading and query parts, and
 * keeps the last path segment. It also removes a `.md` suffix.
 *
 * @param target - A wiki link target or a Markdown link URL.
 * @returns The visible file name.
 */
function linkFileName(target: string): string {
    let path = target;
    try {
        path = decodeURIComponent(path);
    } catch {
        // Keep the raw target when it is not valid percent encoding.
    }
    path = path.split("#")[0].split("?")[0];
    const slash = path.lastIndexOf("/");
    if (slash >= 0) path = path.slice(slash + 1);
    return path.replace(/\.md$/i, "");
}

/**
 * Replace one wiki link with its visible text.
 *
 * @param _match - The full link text. The function does not use it.
 * @param target - The link target.
 * @param display - The optional display text after a pipe.
 * @returns The display text, or the target file name.
 */
function replaceWikiLink(
    _match: string,
    target: string,
    display?: string,
): string {
    const label = display?.trim();
    if (label) return label;
    return linkFileName(target);
}

/**
 * Replace one Markdown link with its visible text.
 *
 * @param _match - The full link text. The function does not use it.
 * @param label - The text between the square brackets.
 * @param url - The URL between the parentheses.
 * @returns The label, or the URL file name.
 */
function replaceMarkdownLink(
    _match: string,
    label: string,
    url: string,
): string {
    const text = label.trim();
    if (text) return text;
    return linkFileName(url);
}

/**
 * Return the visible name of a tag.
 *
 * A tag can contain Markdown. The function replaces each link with its visible
 * text. Then it removes emphasis markers. The card shows the name with the tag
 * color, and the autocomplete list compares names.
 *
 * @param markdown - The raw tag text.
 * @returns The visible name without Markdown formatting.
 */
export function tagNameFromMarkdown(markdown: string): string {
    let text = markdown.replace(WIKI_LINK, replaceWikiLink);
    text = text.replace(MARKDOWN_LINK, replaceMarkdownLink);
    return text.replace(/[*_~`]/g, "").trim();
}

/**
 * Return the Obsidian color variable for a tag.
 *
 * The function hashes the lowercase visible name. The same name always uses the
 * same color in every card.
 *
 * @param markdown - The raw tag text.
 * @returns A CSS color variable name, such as `--color-blue`.
 */
export function tagColorVariable(markdown: string): string {
    const name = tagNameFromMarkdown(markdown).toLowerCase();
    return hashColorVariable(name);
}

/**
 * Collect one raw tag for each visible tag name.
 *
 * The function reads the tags of all notes. It keeps the first raw text for a
 * name, so the suggestion keeps its link.
 *
 * @param notes - The notes of the project, keyed by note ID.
 * @returns The raw tag texts, one for each visible name.
 */
export function collectTagSuggestions(notes: Record<string, Note>): string[] {
    const byName = new Map<string, string>();
    for (const note of Object.values(notes)) {
        for (const tag of note.tags ?? []) {
            const name = tagNameFromMarkdown(tag);
            if (!name) continue;
            const key = name.toLowerCase();
            if (!byName.has(key)) byName.set(key, tag);
        }
    }
    return [...byName.values()];
}
