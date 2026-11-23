import { serializeInstructions } from "@motiojs/paths";
import { joinPoints } from "./join-points.js";
import { assertSingleRounding, type ShapeInfo } from "./shape-info.js";

/** Direction a triangle or arrow points to. */
export type ShapeDirection = "up" | "down" | "left" | "right";

/** Options of `makeTriangle()`. */
export type MakeTriangleProps = {
	/** Length of each side. */
	length: number;
	direction: ShapeDirection;
	/** Rounds the corners. Default 0. */
	cornerRadius?: number;
	/** Rounds the edges with Bézier curves. Default null. */
	edgeRoundness?: number | null;
};

/**
 * Generates an equilateral triangle, compatible with Remotion's `makeTriangle()`.
 *
 * @example makeTriangle({length: 100, direction: "right"}).path // "M 0 0 L 0 100 L 86.60254037844386 50 L 0 0 Z"
 */
export const makeTriangle = ({
	length,
	direction,
	cornerRadius = 0,
	edgeRoundness = null,
}: MakeTriangleProps): ShapeInfo => {
	assertSingleRounding(cornerRadius, edgeRoundness);
	const longSide = length;
	const shortSide = (length * Math.sqrt(3)) / 2;
	const vertical = direction === "up" || direction === "down";
	const width = vertical ? longSide : shortSide;
	const height = vertical ? shortSide : longSide;
	const pointsByDirection: Record<ShapeDirection, [number, number][]> = {
		up: [
			[width / 2, 0],
			[0, height],
			[width, height],
			[width / 2, 0],
		],
		down: [
			[0, 0],
			[width, 0],
			[width / 2, height],
			[0, 0],
		],
		left: [
			[width, 0],
			[width, height],
			[0, height / 2],
			[width, 0],
		],
		right: [
			[0, 0],
			[0, height],
			[width, height / 2],
			[0, 0],
		],
	};
	const points = pointsByDirection[direction];
	if (points === undefined) {
		// Remotion fails with a TypeError on an unknown direction.
		throw new TypeError(
			`direction is ${JSON.stringify(direction)}: use "up", "down", "left" or "right".`,
		);
	}
	const origins: Record<ShapeDirection, string> = {
		up: `${width / 2} ${(height / 3) * 2}`,
		down: `${width / 2} ${height / 3}`,
		left: `${(width / 3) * 2} ${height / 2}`,
		right: `${width / 3} ${height / 2}`,
	};
	const instructions = joinPoints(points, { edgeRoundness, cornerRadius, close: true });
	return {
		path: serializeInstructions(instructions),
		instructions,
		width,
		height,
		transformOrigin: origins[direction],
	};
};
