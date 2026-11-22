/**
 * Widens an SVG `viewBox` by `scale` in every direction around its centre,
 * compatible with Remotion's `extendViewBox()`. Throws if the viewBox is not
 * four numbers or its width or height is not positive.
 *
 * @example extendViewBox("0 0 1000 1000", 2) // "-500 -500 2000 2000"
 */
export const extendViewBox = (currentViewBox: string, scale: number): string => {
	const parts = currentViewBox
		.trim()
		.split(/[\s,]+/)
		.map((part) => Number(part));
	if (parts.length !== 4 || !parts.every((part) => Number.isFinite(part))) {
		throw new Error(`currentViewBox must be 4 valid numbers, but got "${currentViewBox}"`);
	}
	const [x, y, width, height] = parts as [number, number, number, number];
	if (width <= 0 || height <= 0) {
		throw new Error(
			`currentViewBox must have a positive width and height, but got "${currentViewBox}"`,
		);
	}
	const widthShrink = width * (1 - scale);
	const heightShrink = height * (1 - scale);
	return [
		x + widthShrink / 2,
		y + heightShrink / 2,
		width - widthShrink,
		height - heightShrink,
	].join(" ");
};
