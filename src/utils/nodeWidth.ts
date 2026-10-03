import type { Note } from "../types";

export const DEFAULT_NODE_WIDTH = 200;
export const MIN_NODE_WIDTH = 120;
export const MAX_NODE_WIDTH = 600;
export const AUTO_NODE_WIDTHS = [200, 320, 440] as const;

/** Horizontal space a card uses for padding and borders, with room for round-off. */
export const NODE_HORIZONTAL_CHROME = 38;

/**
 * Choose an automatic width from the content length and the title width.
 *
 * @param note - The note title and short description.
 * @param titleWidth - The measured single-line width of the title. Use
 *   undefined when the caller did not measure the title.
 * @returns The automatic card width in pixels.
 */
export function automaticNodeWidth(
    note: Pick<Note, "title" | "short">,
    titleWidth?: number,
): number {
    const text = `${note.title} ${note.short}`
        .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias ?? target)
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\s+/g, " ").trim();

    const base = AUTO_NODE_WIDTHS[text.length <= 120 ? 0 : text.length <= 300 ? 1 : 2];
    const titleNeeds = titleWidth === undefined ? 0 : titleWidth + NODE_HORIZONTAL_CHROME;
    const width = Math.max(base, titleNeeds);
    return Math.ceil(Math.max(MIN_NODE_WIDTH, Math.min(MAX_NODE_WIDTH, width)));
}

/**
 * Return the card width for a note.
 *
 * @param note - The note to size.
 * @param titleWidth - The measured single-line width of the title. Use
 *   undefined when the caller did not measure the title.
 * @returns The manual width when the note has one, or the automatic width.
 */
export function noteWidth(note: Note, titleWidth?: number): number {
    return note.width !== undefined && Number.isFinite(note.width)
        ? Math.max(MIN_NODE_WIDTH, Math.min(MAX_NODE_WIDTH, note.width))
        : automaticNodeWidth(note, titleWidth);
}

export function snapNodeWidth(width: number, candidates: number[], zoom = 1): number {
    const clamped = Math.max(MIN_NODE_WIDTH, Math.min(MAX_NODE_WIDTH, width));
    let result = clamped;
    let distance = 8 / Math.max(0.01, zoom);
    for (const candidate of candidates) {
        const delta = Math.abs(candidate - clamped);
        if (candidate >= MIN_NODE_WIDTH && candidate <= MAX_NODE_WIDTH && delta <= distance) {
            result = candidate;
            distance = delta;
        }
    }
    return Math.round(result);
}
