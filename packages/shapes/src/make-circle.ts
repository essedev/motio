import { type Instruction, serializeInstructions } from "@motiojs/paths";
import type { ShapeInfo } from "./shape-info.js";

/** Options of `makeCircle()`. */
export type MakeCircleProps = { radius: number };

/**
 * Generates a circle, compatible with Remotion's `makeCircle()`.
 *
 * @example makeCircle({radius: 50}).path // "M 50 0 a 50 50 0 1 1 0 100 a 50 50 0 1 1 0 -100 Z"
 */
export const makeCircle = ({ radius }: MakeCircleProps): ShapeInfo => {
	const arc = (dy: number): Instruction => ({
		type: "a",
		rx: radius,
		ry: radius,
		xAxisRotation: 0,
		largeArcFlag: true,
		sweepFlag: true,
		dx: 0,
		dy,
	});
	const instructions: Instruction[] = [
		{ type: "M", x: radius, y: 0 },
		arc(radius * 2),
		arc(-radius * 2),
		{ type: "Z" },
	];
	return {
		height: radius * 2,
		width: radius * 2,
		path: serializeInstructions(instructions),
		instructions,
		transformOrigin: `${radius} ${radius}`,
	};
};
