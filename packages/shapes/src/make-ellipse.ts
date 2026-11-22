import { type Instruction, serializeInstructions } from "@motiojs/paths";
import type { ShapeInfo } from "./shape-info.js";

/** Options of `makeEllipse()`. */
export type MakeEllipseProps = { rx: number; ry: number };

/**
 * Generates an ellipse, compatible with Remotion's `makeEllipse()`.
 *
 * @example makeEllipse({rx: 100, ry: 50}).path // "M 100 0 a 100 50 0 1 0 1 0 Z"
 */
export const makeEllipse = ({ rx, ry }: MakeEllipseProps): ShapeInfo => {
	const instructions: Instruction[] = [
		{ type: "M", x: rx, y: 0 },
		{ type: "a", rx, ry, xAxisRotation: 0, largeArcFlag: true, sweepFlag: false, dx: 1, dy: 0 },
		{ type: "Z" },
	];
	return {
		width: rx * 2,
		height: ry * 2,
		path: serializeInstructions(instructions),
		instructions,
		transformOrigin: `${rx} ${ry}`,
	};
};
