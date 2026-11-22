import { type Instruction, serializeInstructions } from "@motiojs/paths";
import type { ShapeDirection } from "./make-triangle.js";
import type { ShapeInfo } from "./shape-info.js";

/** Options of `makeArrow()`. */
export type MakeArrowProps = {
	/** Total length along the direction. Default 300. */
	length?: number;
	/** Width of the head at its widest. Default 185. */
	headWidth?: number;
	/** Length of the head. Default 120. */
	headLength?: number;
	/** Width of the shaft. Default 80. */
	shaftWidth?: number;
	/** Default "right". */
	direction?: ShapeDirection;
	/** Rounds the outer corners. Default 0. */
	cornerRadius?: number;
};

type Pt = [number, number];

const towards = (from: Pt, to: Pt, length: number): Pt => {
	const d = Math.sqrt((to[0] - from[0]) ** 2 + (to[1] - from[1]) ** 2);
	return [from[0] + ((to[0] - from[0]) / d) * length, from[1] + ((to[1] - from[1]) / d) * length];
};

/**
 * Generates an arrow, compatible with Remotion's `makeArrow()`. With a corner
 * radius, the outer corners are rounded; the two corners where the shaft
 * meets the head stay sharp.
 *
 * @example makeArrow({}).path // "M 0 52.5 L 180 52.5 L 180 0 L 300 92.5 L 180 185 L 180 132.5 L 0 132.5 Z"
 */
export const makeArrow = ({
	length = 300,
	headWidth = 185,
	headLength = 120,
	shaftWidth = 80,
	direction = "right",
	cornerRadius = 0,
}: MakeArrowProps): ShapeInfo => {
	if (!(length > 0 && headWidth > 0 && headLength > 0 && shaftWidth > 0)) {
		throw new Error(
			'All dimension parameters ("length", "headWidth", "headLength", "shaftWidth") must be positive numbers',
		);
	}
	if (headWidth < shaftWidth) {
		throw new Error(
			`"headWidth" must be greater than or equal to "shaftWidth", got headWidth=${headWidth} and shaftWidth=${shaftWidth}`,
		);
	}
	if (headLength > length) {
		throw new Error(
			`"headLength" must be less than or equal to "length", got headLength=${headLength} and length=${length}`,
		);
	}
	const shaftTop = (headWidth - shaftWidth) / 2;
	const shaftBottom = (headWidth + shaftWidth) / 2;
	const neck = length - headLength;
	// Pointing right, clockwise from the shaft's start; the neck corners
	// (indices 1 and 5) are never rounded.
	const right: Pt[] = [
		[0, shaftTop],
		[neck, shaftTop],
		[neck, 0],
		[length, headWidth / 2],
		[neck, headWidth],
		[neck, shaftBottom],
		[0, shaftBottom],
	];
	const order =
		direction === "up" || direction === "down" ? [0, 6, 5, 4, 3, 2, 1] : [0, 1, 2, 3, 4, 5, 6];
	const transform = (p: Pt): Pt => {
		switch (direction) {
			case "right":
				return p;
			case "left":
				return [length - p[0], p[1]];
			case "down":
				return [p[1], p[0]];
			default:
				return [p[1], length - p[0]];
		}
	};
	const points = order.map((i) => transform(right[i] as Pt));
	const rounded = order.map((i) => cornerRadius !== 0 && i !== 1 && i !== 5);
	const n = points.length;
	const at = (i: number) => points[(i + n) % n] as Pt;
	const instructions: Instruction[] = [];
	const first = at(0);
	const start = rounded[0] ? towards(first, at(1), cornerRadius) : first;
	instructions.push({ type: "M", x: start[0], y: start[1] });
	for (let k = 1; k <= n; k++) {
		const corner = at(k);
		if (!rounded[k % n]) {
			if (k < n) instructions.push({ type: "L", x: corner[0], y: corner[1] });
			continue;
		}
		const before = towards(corner, at(k - 1), cornerRadius);
		const after = towards(corner, at(k + 1), cornerRadius);
		instructions.push({ type: "L", x: before[0], y: before[1] });
		instructions.push({
			type: "C",
			cp1x: corner[0],
			cp1y: corner[1],
			cp2x: corner[0],
			cp2y: corner[1],
			x: after[0],
			y: after[1],
		});
	}
	instructions.push({ type: "Z" });
	const vertical = direction === "up" || direction === "down";
	const width = vertical ? headWidth : length;
	const height = vertical ? length : headWidth;
	return {
		path: serializeInstructions(instructions),
		instructions,
		width,
		height,
		transformOrigin: `${width / 2} ${height / 2}`,
	};
};
