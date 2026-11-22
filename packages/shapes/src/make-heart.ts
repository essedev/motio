import { type Instruction, serializeInstructions } from "@motiojs/paths";
import type { ShapeInfo } from "./shape-info.js";

/** Options of `makeHeart()`. */
export type MakeHeartProps = {
	height: number;
	/** Width divided by height. Default 1.1. */
	aspectRatio?: number;
	/** Rounder (positive) or sharper (negative) bottom point. Default 0. */
	bottomRoundnessAdjustment?: number;
	/** Shallower (positive) or deeper (negative) dip at the top. Default 0. */
	depthAdjustment?: number;
};

/**
 * Generates a heart, compatible with Remotion's `makeHeart()`. The outline is
 * defined on a 110 by 100 design grid and scaled to the size.
 *
 * @example makeHeart({height: 100}).width // 110.00000000000001
 */
export const makeHeart = ({
	height,
	aspectRatio = 1.1,
	bottomRoundnessAdjustment = 0,
	depthAdjustment = 0,
}: MakeHeartProps): ShapeInfo => {
	const width = height * aspectRatio;
	const x = (design: number) => (design * width) / 110;
	const y = (design: number) => (design * height) / 100;
	const bottomX = (design: number) => x(design) - bottomRoundnessAdjustment * width;
	const c = (
		cp1x: number,
		cp1y: number,
		cp2x: number,
		cp2y: number,
		ex: number,
		ey: number,
	): Instruction => ({ type: "C", cp1x, cp1y, cp2x, cp2y, x: ex, y: ey });
	const instructions: Instruction[] = [
		{ type: "M", x: width / 2, y: height },
		c(bottomX(32), y(69), 0, y(60), 0, y(25)),
		c(0, y(13), x(13), 0, x(27.5), 0),
		c(x(42), 0, x(50), y(7), width / 2, (0.17 + depthAdjustment) * height),
		c(x(60), y(7), x(70), 0, x(82.5), 0),
		c(x(97), 0, width, y(13), width, y(25)),
		c(width, y(60), width - bottomX(32), y(69), width / 2, height),
		{ type: "Z" },
	];
	return {
		path: serializeInstructions(instructions),
		instructions,
		width,
		height,
		transformOrigin: `${width / 2} ${height / 2}`,
	};
};
