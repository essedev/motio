import { type Instruction, serializeInstructions } from "@motiojs/paths";
import type { ShapeInfo } from "./shape-info.js";

/** Options of `makePie()`. */
export type MakePieProps = {
	radius: number;
	/** Filled share of the circle, 0 to 1. */
	progress: number;
	/** Fill counterclockwise. Default false. */
	counterClockwise?: boolean;
	/** Draw the lines to the centre. Default true. */
	closePath?: boolean;
	/** Rotation in radians, clockwise. Default 0. */
	rotation?: number;
};

// Arc endpoints are rounded to 5 decimals, as Remotion does.
const fixed = (value: number): number => Number(value.toFixed(5));

/**
 * Generates a pie slice, compatible with Remotion's `makePie()`.
 *
 * @example makePie({radius: 100, progress: 0.5}).path // "M 100 0 A 100 100 0 0 1 100 200 L 100 100 Z"
 */
export const makePie = ({
	radius,
	progress,
	closePath = true,
	counterClockwise = false,
	rotation = 0,
}: MakePieProps): ShapeInfo => {
	const actual = Math.min(Math.max(progress, 0), 1);
	const direction = counterClockwise ? -1 : 1;
	const start = rotation - Math.PI / 2;
	const point = (angle: number): [number, number] => [
		fixed(radius + radius * Math.cos(angle)),
		fixed(radius + radius * Math.sin(angle)),
	];
	const arc = ([x, y]: [number, number]): Instruction => ({
		type: "A",
		rx: radius,
		ry: radius,
		xAxisRotation: 0,
		largeArcFlag: false,
		sweepFlag: !counterClockwise,
		x,
		y,
	});
	const [startX, startY] = point(start);
	const instructions: Instruction[] = [{ type: "M", x: startX, y: startY }];
	if (actual > 0.5) instructions.push(arc(point(start + direction * Math.PI)));
	instructions.push(arc(point(start + direction * actual * Math.PI * 2)));
	if (closePath) {
		if (actual > 0 && actual < 1) instructions.push({ type: "L", x: radius, y: radius });
		instructions.push({ type: "Z" });
	}
	return {
		height: radius * 2,
		width: radius * 2,
		path: serializeInstructions(instructions),
		instructions,
		transformOrigin: `${radius} ${radius}`,
	};
};
