// @why We use flip instead of CSS transitions because it's just too much objects for browser at once
export interface FlipParams {
    x: number;
    y: number;
    width?: number;
    minHeight?: number;
}

/**
 * Animate a node from its old position and size to the new one.
 *
 * The action animates the transform together with the width and minimum
 * height. One animation keeps the size and the position in step.
 *
 * @param node - The element to move.
 * @param params - The new position and optional size.
 * @returns The action update hook.
 */
export function flip(node: HTMLElement, params: FlipParams) {
    let old: FlipParams = { ...params };

    return {
        update(next: FlipParams) {
            const dx = old.x - next.x;
            const dy = old.y - next.y;
            const sizeChanged =
                (old.width !== undefined &&
                    next.width !== undefined &&
                    old.width !== next.width) ||
                (old.minHeight !== undefined &&
                    next.minHeight !== undefined &&
                    old.minHeight !== next.minHeight);

            if (dx !== 0 || dy !== 0 || sizeChanged) {
                const from: Record<string, string> = {
                    transform: `translate(${dx}px, ${dy}px)`,
                };
                const to: Record<string, string> = {
                    transform: "translate(0, 0)",
                };
                if (old.width !== undefined && next.width !== undefined) {
                    from.width = `${old.width}px`;
                    to.width = `${next.width}px`;
                }
                if (old.minHeight !== undefined && next.minHeight !== undefined) {
                    from.minHeight = `${old.minHeight}px`;
                    to.minHeight = `${next.minHeight}px`;
                }
                node.animate([from, to], {
                    duration: 300,
                    easing: "cubic-bezier(0.25, 0.1, 0.25, 1)",
                    fill: "none",
                });
            }

            old = { ...next };
        },
    };
}
