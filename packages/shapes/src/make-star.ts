import { polygonShape } from "./polygon-path.js";
import { assertSingleRounding, type ShapeInfo } from "./shape-info.js";

/** Options of `makeStar()`. */
export type MakeStarProps = {
	/** Number of points of the star. */
	points: number;
	innerRadius: number;
	outerRadius: number;
	/** Rounds the edges with Bézier curves. Default null. */
	edgeRoundness?: number | null;
	/** Rounds the corners. Default 0. */
	cornerRadius?: number;
};

/**
 * Generates a star, compatible with Remotion's `makeStar()`.
 *
 * @example makeStar({points: 5, innerRadius: 150, outerRadius: 200}).width // 380.42260651806146
 */
export const makeStar = ({
	points,
	innerRadius,
	outerRadius,
	cornerRadius = 0,
	edgeRoundness = null,
}: MakeStarProps): ShapeInfo => {
	assertSingleRounding(cornerRadius, edgeRoundness);
	const corners: [number, number][] = [];
	for (let i = 0; i < points * 2; i++) {
		const radius = i % 2 === 0 ? outerRadius : innerRadius;
		const angle = (Math.PI / points) * i - Math.PI / 2;
		corners.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
	}
	return polygonShape(corners, { edgeRoundness, cornerRadius, close: true });
};
