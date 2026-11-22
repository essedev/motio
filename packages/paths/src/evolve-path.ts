import { getLength } from "./measure.js";

/**
 * Stroke dash values that draw an SVG path progressively, compatible with
 * Remotion's `evolvePath()`. `progress` 0 hides the path, 1 draws it fully;
 * values above 1 retract it from the start, values below 0 draw it from the
 * end. Pass both values to the `<path>` element.
 *
 * @example evolvePath(0.5, "M 0 0 L 100 0") // {strokeDasharray: "100 100", strokeDashoffset: 50}
 */
export const evolvePath = (
	progress: number,
	path: string,
): { strokeDasharray: string; strokeDashoffset: number } => {
	const length = getLength(path);
	// At exactly 0 the dash is made longer than the path, as Remotion does, so
	// that no dot of the round line cap remains visible.
	const dash = progress === 0 ? length * 1.5 : length;
	return {
		strokeDasharray: `${dash} ${dash}`,
		strokeDashoffset: dash - progress * dash,
	};
};
