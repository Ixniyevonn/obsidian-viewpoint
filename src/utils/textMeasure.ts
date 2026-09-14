import type { PreparedText } from "@chenglou/pretext";
import { layout, prepare } from "@chenglou/pretext";

// Cache keyed by "font\0text" → PreparedText
const cache = new Map<string, PreparedText>();

/**
 * Measure the height of text as it would wrap within maxWidth at the given lineHeight.
 * Uses pretext: prepare() does canvas-based measurement once (cached), layout() is pure math.
 */
export function measureTextHeight(
    text: string,
    font: string,
    maxWidth: number,
    lineHeight: number,
): { height: number; lineCount: number } {
    if (!text) return { height: 0, lineCount: 0 };

    const key = `${font}\x00${text}`;
    let prepared = cache.get(key);
    if (!prepared) {
        prepared = prepare(text, font);
        cache.set(key, prepared);
    }
    return layout(prepared, maxWidth, lineHeight);
}

/**
 * Evict cache entries whose text key is no longer in the live set.
 * Call periodically (e.g. on project load) to prevent unbounded growth.
 */
export function pruneCache(liveTexts?: Set<string>) {
    if (!liveTexts) {
        cache.clear();
        return;
    }
    for (const key of cache.keys()) {
        const text = key.slice(key.indexOf("\x00") + 1);
        if (!liveTexts.has(text)) cache.delete(key);
    }
}

export interface FontConfig {
    titleFont: string;   // canvas font string, e.g. "bold 24px Inter"
    bodyFont: string;    // e.g. "14px Inter"
    titleLineHeight: number;
    bodyLineHeight: number;
}

/** Default fallback if detection hasn't run yet */
export const DEFAULT_FONTS: FontConfig = {
    titleFont: "bold 24px sans-serif",
    bodyFont: "16px sans-serif",
    titleLineHeight: 32,
    bodyLineHeight: 24,
};

/**
 * Detect actual rendered fonts from a container element by probing computed styles.
 * Creates temporary h1 and p elements, reads getComputedStyle, removes them.
 */
export function detectFonts(container: HTMLElement): FontConfig {
    const probe = document.createElement("div");
    probe.style.cssText =
        "position:absolute;visibility:hidden;pointer-events:none;width:200px;";
    // Apply the same classes the node cards live in
    probe.className = "markdown-rendered";

    const h1 = document.createElement("h2");
    h1.textContent = "Xg";
    probe.appendChild(h1);

    const p = document.createElement("p");
    p.textContent = "Xg";
    probe.appendChild(p);

    container.appendChild(probe);

    const h1s = getComputedStyle(h1);
    const ps = getComputedStyle(p);

    // Build canvas-compatible font strings: "[style] [weight] [size] [family]"
    const titleFont = buildFontString(h1s);
    const bodyFont = buildFontString(ps);
    const titleLineHeight = parseFloat(h1s.lineHeight) || 32;
    const bodyLineHeight = parseFloat(ps.lineHeight) || 24;

    container.removeChild(probe);

    return { titleFont, bodyFont, titleLineHeight, bodyLineHeight };
}

function buildFontString(cs: CSSStyleDeclaration): string {
    const style = cs.fontStyle === "normal" ? "" : cs.fontStyle;
    const weight = cs.fontWeight;
    const size = cs.fontSize; // already "16px" etc
    const family = cs.fontFamily;
    return [style, weight, size, family].filter(Boolean).join(" ");
}