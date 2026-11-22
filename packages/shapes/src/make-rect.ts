import { type Instruction, serializeInstructions } from "@motiojs/paths";
import { joinPoints } from "./join-points.js";
import { assertSingleRounding, type ShapeInfo } from "./shape-info.js";

/** Options of `makeRect()`. */
export type MakeRectProps = {
	width: number;
	height: number;
	/** Rounds the corners with arcs, like CSS `border-radius`. Default 0. */
	cornerRadius?: number;
	/** Rounds the edges with Bézier curves; 1 draws a squircle. Default null. */
	edgeRoundness?: number | null;
};

/**
 * Generates a rectangle, compatible with Remotion's `makeRect()`.
 *
 * @example makeRect({width: 100, height: 100}).path // "M 0 0 L 100 0 L 100 100 L 0 100 L 0 0 Z"
 */
export const makeRect = ({
	width,
	height,
	cornerRadius = 0,
	edgeRoundness = null,
}: MakeRectProps): ShapeInfo => {
	assertSingleRounding(cornerRadius, edgeRoundness);
	const transformOrigin = `${width / 2} ${height / 2}`;
	let instructions: Instruction[];
	if (cornerRadius !== 0) {
		const r = Math.min(cornerRadius, width / 2, height / 2);
		const arc = (dx: number, dy: number): Instruction => ({
			type: "a",
			rx: r,
			ry: r,
			xAxisRotation: 0,
			dx,
			dy,
			largeArcFlag: false,
			sweepFlag: true,
		});
		instructions = [
			{ type: "M", x: width - r, y: 0 },
			{ type: "L", x: width - r, y: 0 },
			arc(r, r),
			{ type: "L", x: width, y: height - r },
			arc(-r, r),
			{ type: "L", x: r, y: height },
			arc(-r, -r),
			{ type: "L", x: 0, y: r },
			arc(r, -r),
			{ type: "Z" },
		];
	} else {
		instructions = joinPoints(
			[
				[0, 0],
				[width, 0],
				[width, height],
				[0, height],
				[0, 0],
			],
			{ edgeRoundness, cornerRadius: 0, close: true },
		);
	}
	return {
		width,
		height,
		path: serializeInstructions(instructions),
		instructions,
		transformOrigin,
	};
};
