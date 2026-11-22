import type { ReducedInstruction } from "./instruction.js";
import { parsePath } from "./parse-path.js";
import { measureInstructions, partAtLength } from "./properties/path-properties.js";
import { lengthToT } from "./properties/segments.js";
import { reduceInstructions } from "./reduce-instructions.js";
import { serializeInstructions } from "./serialize-instructions.js";

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** First part of a cubic from (x0, y0) split at t (de Casteljau). */
const splitCubic = (
	x0: number,
	y0: number,
	c: Extract<ReducedInstruction, { type: "C" }>,
	t: number,
): ReducedInstruction => {
	const x01 = lerp(x0, c.cp1x, t);
	const y01 = lerp(y0, c.cp1y, t);
	const x12 = lerp(c.cp1x, c.cp2x, t);
	const y12 = lerp(c.cp1y, c.cp2y, t);
	const x23 = lerp(c.cp2x, c.x, t);
	const y23 = lerp(c.cp2y, c.y, t);
	const x012 = lerp(x01, x12, t);
	const y012 = lerp(y01, y12, t);
	const x123 = lerp(x12, x23, t);
	const y123 = lerp(y12, y23, t);
	return {
		type: "C",
		cp1x: x01,
		cp1y: y01,
		cp2x: x012,
		cp2y: y012,
		x: lerp(x012, x123, t),
		y: lerp(y012, y123, t),
	};
};

/**
 * Cuts an SVG path at a length and returns the part from the start, compatible
 * with Remotion's `cutPath()`. The result is made of `M`, `L`, `C` and `Z`
 * instructions (see `reduceInstructions()`). A length beyond the end returns
 * the whole path, a length of 0 only the initial move. Instructions before the
 * first move are dropped.
 *
 * @example cutPath("M 0 0 L 100 0 L 100 100", 50) // "M 0 0 L 50 0"
 */
export const cutPath = (d: string, length: number): string => {
	const all = reduceInstructions(parsePath(d));
	const firstMove = all.findIndex((i) => i.type === "M");
	const reduced = firstMove === -1 ? [] : all.slice(firstMove);
	// The length is measured on the reduced path (arcs as their cubics).
	const properties = measureInstructions(reduced);
	if (Number.isNaN(length) || length > properties.length) return serializeInstructions(reduced);
	const { index, lengthIntoInstruction } = partAtLength(properties, Math.max(0, length));
	const out = reduced.slice(0, index);
	const segment = properties.segments[index];
	const target = reduced[index];
	if (segment && target !== undefined && target.type !== "M" && lengthIntoInstruction > 0) {
		if ((properties.partialLengths[index] as number) <= length) {
			// The length reaches the end of this instruction: keep it whole.
			out.push(target);
		} else if (target.type === "C") {
			const previous = out[out.length - 1];
			const start = currentPoint(out, previous);
			const t = lengthToT(
				lengthIntoInstruction,
				segment.length,
				segment.lengthAtT as (t: number) => number,
			);
			out.push(splitCubic(start.x, start.y, target, t));
		} else {
			const point = segment.pointAt(lengthIntoInstruction);
			out.push({ type: "L", x: point.x, y: point.y });
		}
	}
	return serializeInstructions(out);
};

/** Current point after a list of reduced instructions. */
const currentPoint = (
	instructions: ReducedInstruction[],
	_previous: ReducedInstruction | undefined,
): { x: number; y: number } => {
	let x = 0;
	let y = 0;
	let startX = 0;
	let startY = 0;
	for (const i of instructions) {
		if (i.type === "Z") {
			x = startX;
			y = startY;
		} else {
			x = i.x;
			y = i.y;
			if (i.type === "M") {
				startX = x;
				startY = y;
			}
		}
	}
	return { x, y };
};
