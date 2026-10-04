/** The canvas pan, zoom, and viewport size in CSS pixels. */
export interface Viewport {
	panX: number;
	panY: number;
	zoom: number;
	width: number;
	height: number;
}

/** A rectangle in world coordinates. */
export interface ViewRect {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

/**
 * Return the world rectangle that the viewport shows.
 *
 * The function adds a margin around the viewport. The margin keeps the next
 * items ready before they move into view.
 *
 * @param viewport - The canvas pan, zoom, and size.
 * @param marginFraction - The margin as a fraction of the viewport size.
 * @returns The world rectangle, or null when the size is not known.
 */
export function viewportRect(
	viewport: Viewport,
	marginFraction = 0.5,
): ViewRect | null {
	if (!viewport.width || !viewport.height || viewport.zoom <= 0) return null;
	const left = 0 - viewport.panX / viewport.zoom;
	const top = 0 - viewport.panY / viewport.zoom;
	const width = viewport.width / viewport.zoom;
	const height = viewport.height / viewport.zoom;
	const marginX = width * marginFraction;
	const marginY = height * marginFraction;
	return {
		x0: left - marginX,
		y0: top - marginY,
		x1: left + width + marginX,
		y1: top + height + marginY,
	};
}

/**
 * Return true when a rectangle touches a view rectangle.
 *
 * @param rect - The view rectangle.
 * @param x - The left edge of the item.
 * @param y - The top edge of the item.
 * @param width - The width of the item.
 * @param height - The height of the item.
 * @returns True when the two rectangles touch.
 */
export function rectsIntersect(
	rect: ViewRect,
	x: number,
	y: number,
	width: number,
	height: number,
): boolean {
	return (
		x + width >= rect.x0 &&
		x <= rect.x1 &&
		y + height >= rect.y0 &&
		y <= rect.y1
	);
}
