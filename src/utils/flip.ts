// @why We use flip instead of CSS transitions because it's just too much objects for browser at once
export function flip(node: HTMLElement, params: { x: number; y: number }) {
    let oldX = params.x;
    let oldY = params.y;

    return {
        update(newParams: { x: number; y: number }) {
            const dx = oldX - newParams.x;
            const dy = oldY - newParams.y;

            if (dx !== 0 || dy !== 0) {
                node.animate(
                    [
                        { transform: `translate(${dx}px, ${dy}px)` },
                        { transform: "translate(0, 0)" },
                    ],
                    {
                        duration: 300,
                        easing: "cubic-bezier(0.25, 0.1, 0.25, 1)",
                        fill: "none",
                    },
                );
            }

            oldX = newParams.x;
            oldY = newParams.y;
        },
    };
}