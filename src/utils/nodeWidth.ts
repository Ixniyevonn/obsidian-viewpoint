import type { Note } from "../types";

export const DEFAULT_NODE_WIDTH = 200;
export const MIN_NODE_WIDTH = 120;
export const MAX_NODE_WIDTH = 600;
export const AUTO_NODE_WIDTHS = [200, 320, 440] as const;

/** Count displayed text, so a long link destination does not widen a card. */
export function automaticNodeWidth(note: Pick<Note, "title" | "short">): number {
    const text = `${note.title} ${note.short}`
        .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias ?? target)
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\s+/g, " ").trim();
    return AUTO_NODE_WIDTHS[text.length <= 120 ? 0 : text.length <= 300 ? 1 : 2];
}

export function noteWidth(note: Note): number {
    return note.width !== undefined && Number.isFinite(note.width)
        ? Math.max(MIN_NODE_WIDTH, Math.min(MAX_NODE_WIDTH, note.width))
        : automaticNodeWidth(note);
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
