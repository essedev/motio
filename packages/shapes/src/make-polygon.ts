import { polygonShape } from "./polygon-path.js";
import { assertSingleRounding, type ShapeInfo } from "./shape-info.js";

/** Options of `makePolygon()`. */
export type MakePolygonProps = {
	/** Number of corners, at least 3. */
	points: number;
	radius: number;
	/** Rounds the edges with Bézier curves. Default null. */
	edgeRoundness?: number | null;
	/** Rounds the corners. Default 0. */
	cornerRadius?: number;
};

/**
 * Generates a regular polygon, compatible with Remotion's `makePolygon()`.
 *
 * @example makePolygon({points: 5, radius: 80}).width // 152.16904260722458
 */
export const makePolygon = ({
	points,
	radius,
	cornerRadius = 0,
	edgeRoundness = null,
}: MakePolygonProps): ShapeInfo => {
	if (points < 3) throw new Error(`"points" should be minimum 3, got ${points}`);
	assertSingleRounding(cornerRadius, edgeRoundness);
	const corners: [number, number][] = [];
	for (let i = 0; i < points; i++) {
		const angle = ((Math.PI * 2) / points) * i - Math.PI / 2;
		corners.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
	}
	return polygonShape(corners, { edgeRoundness, cornerRadius, close: false });
};
