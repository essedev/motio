import { type Instruction, serializeInstructions } from "@motiojs/paths";
import type { ShapeInfo } from "./shape-info.js";

/** Options of `makeSpark()`. */
export type MakeSparkProps = {
	width: number;
	height: number;
	/** Inward curvature of the edges between the points. Default 1. */
	edgeRoundness?: number;
	/** Rounds the four points. Default 0. */
	cornerRadius?: number;
};

// Control distance of a quarter circle drawn with one cubic.
const KAPPA = (4 * (Math.SQRT2 - 1)) / 3;

/**
 * Generates a four-pointed spark, compatible with Remotion's `makeSpark()`.
 *
 * @example makeSpark({width: 240, height: 336}).width // 240
 */
export const makeSpark = ({
	width,
	height,
	edgeRoundness = 1,
	cornerRadius = 0,
}: MakeSparkProps): ShapeInfo => {
	const cx = width / 2;
	const cy = height / 2;
	// The radius is clamped so the caps stay within the shape.
	const r = Math.min(Math.max(cornerRadius, 0), cx, cy);
	const k = KAPPA * edgeRoundness;
	const c = (
		cp1x: number,
		cp1y: number,
		cp2x: number,
		cp2y: number,
		x: number,
		y: number,
	): Instruction => ({ type: "C", cp1x, cp1y, cp2x, cp2y, x, y });
	// Tips (with a corner radius, each tip becomes a cap between two points).
	const topRight: [number, number] = [cx + r, r];
	const rightTop: [number, number] = [width - r, cy - r];
	const rightBottom: [number, number] = [width - r, cy + r];
	const bottomRight: [number, number] = [cx + r, height - r];
	const bottomLeft: [number, number] = [cx - r, height - r];
	const leftBottom: [number, number] = [r, cy + r];
	const leftTop: [number, number] = [r, cy - r];
	const topLeft: [number, number] = [cx - r, r];
	const cap = (r * 4) / 3;
	const instructions: Instruction[] = [{ type: "M", x: topRight[0], y: topRight[1] }];
	// Each edge leaves one tip along one axis and reaches the next tip along
	// the other; control points sit k times the (absolute) span from the tips.
	const edge = (
		[ax, ay]: [number, number],
		[bx, by]: [number, number],
		leaveVertically: boolean,
		toward: [number, number],
	): Instruction => {
		const dx = Math.abs(bx - ax) * k * toward[0];
		const dy = Math.abs(by - ay) * k * toward[1];
		return leaveVertically
			? c(ax, ay + dy, bx - dx, by, bx, by)
			: c(ax - dx, ay, bx, by - dy, bx, by);
	};
	instructions.push(edge(topRight, rightTop, true, [1, 1]));
	if (r !== 0)
		instructions.push(c(width - r + cap, cy - r, width - r + cap, cy + r, ...rightBottom));
	instructions.push(edge(rightBottom, bottomRight, false, [1, 1]));
	if (r !== 0)
		instructions.push(c(cx + r, height - r + cap, cx - r, height - r + cap, ...bottomLeft));
	instructions.push(edge(bottomLeft, leftBottom, true, [-1, -1]));
	if (r !== 0) instructions.push(c(r - cap, cy + r, r - cap, cy - r, ...leftTop));
	instructions.push(edge(leftTop, topLeft, false, [-1, -1]));
	if (r !== 0) instructions.push(c(cx - r, r - cap, cx + r, r - cap, ...topRight));
	instructions.push({ type: "Z" });
	return {
		path: serializeInstructions(instructions),
		instructions,
		width,
		height,
		transformOrigin: `${cx} ${cy}`,
	};
};
