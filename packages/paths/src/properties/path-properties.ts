// Path-level measurement, following svg-path-properties (MIT, see
// segments.ts): one entry per instruction, `null` for moves, and the running
// total of lengths used to find the instruction at a given length.

import type { Instruction, Point } from "../instruction.js";
import { arcSegment, bezierSegment, lineSegment, type Segment } from "./segments.js";

/**
 * Remotion fails with a TypeError when a path it measures starts with a smooth curve (S, s, T or
 * t); Motio throws a TypeError there too, with a message that says why.
 */
export const assertNoLeadingSmoothCurve = (instructions: Instruction[]): void => {
	const first = instructions[0]?.type;
	if (first === "S" || first === "s" || first === "T" || first === "t") {
		throw new TypeError(
			`The path starts with ${first}, a smooth curve that continues a previous curve: start it with a move (M).`,
		);
	}
};

/** Measured path: one segment per instruction (null for moves) and running lengths. */
export type PathProperties = {
	segments: (Segment | null)[];
	partialLengths: number[];
	length: number;
	initialPoint: Point | null;
};

/**
 * Measures every instruction of a path, relative ones included, with the
 * same arithmetic as svg-path-properties (relative offsets are added to the
 * current point per instruction, smooth curves reflect the previous control
 * point). The initial point is only known when the path starts with `M`.
 */
export const measureInstructions = (instructions: Instruction[]): PathProperties => {
	const segments: (Segment | null)[] = [];
	const partialLengths: number[] = [];
	let length = 0;
	let cx = 0;
	let cy = 0;
	let ringX = 0;
	let ringY = 0;
	let initialPoint: Point | null = null;
	// Second control point of the last cubic, for S and s.
	let lastCx = 0;
	let lastCy = 0;
	// Control point of the last quadratic (reflected for T and t).
	let prevX = 0;
	let prevY = 0;
	assertNoLeadingSmoothCurve(instructions);
	instructions.forEach((i, index) => {
		const previous = instructions[index - 1]?.type;
		let segment: Segment | null = null;
		// What the instruction adds to the running length. svg-path-properties
		// computes it from the instruction's own values for l, h, v, H and V,
		// which can differ in the last bit from the segment's length.
		let added: number | null = null;
		switch (i.type) {
			case "M":
				cx = ringX = i.x;
				cy = ringY = i.y;
				if (index === 0) initialPoint = { x: i.x, y: i.y };
				break;
			case "m":
				cx = ringX = i.dx + cx;
				cy = ringY = i.dy + cy;
				break;
			case "L":
				segment = lineSegment(cx, cy, i.x, i.y);
				cx = i.x;
				cy = i.y;
				break;
			case "l":
				segment = lineSegment(cx, cy, i.dx + cx, i.dy + cy);
				added = Math.sqrt(i.dx ** 2 + i.dy ** 2);
				cx = i.dx + cx;
				cy = i.dy + cy;
				break;
			case "H":
				segment = lineSegment(cx, cy, i.x, cy);
				added = Math.abs(cx - i.x);
				cx = i.x;
				break;
			case "h":
				segment = lineSegment(cx, cy, cx + i.dx, cy);
				added = Math.abs(i.dx);
				cx = i.dx + cx;
				break;
			case "V":
				segment = lineSegment(cx, cy, cx, i.y);
				added = Math.abs(cy - i.y);
				cy = i.y;
				break;
			case "v":
				segment = lineSegment(cx, cy, cx, cy + i.dy);
				added = Math.abs(i.dy);
				cy = i.dy + cy;
				break;
			case "Z":
				segment = lineSegment(cx, cy, ringX, ringY);
				cx = ringX;
				cy = ringY;
				break;
			case "C":
				segment = bezierSegment([cx, i.cp1x, i.cp2x, i.x], [cy, i.cp1y, i.cp2y, i.y]);
				lastCx = i.cp2x;
				lastCy = i.cp2y;
				cx = i.x;
				cy = i.y;
				break;
			case "c": {
				const curve = bezierSegment(
					[cx, cx + i.cp1dx, cx + i.cp2dx, cx + i.dx],
					[cy, cy + i.cp1dy, cy + i.cp2dy, cy + i.dy],
				);
				lastCx = cx + i.cp2dx;
				lastCy = cy + i.cp2dy;
				if (curve.length > 0) {
					segment = curve;
					cx = i.dx + cx;
					cy = i.dy + cy;
				} else {
					segment = lineSegment(cx, cy, cx, cy);
				}
				break;
			}
			case "S":
			case "s": {
				const smooth = previous === "C" || previous === "c" || previous === "S" || previous === "s";
				const endX = i.type === "S" ? i.x : cx + i.dx;
				const endY = i.type === "S" ? i.y : cy + i.dy;
				const cp2x = i.type === "S" ? i.cpx : cx + i.cpdx;
				const cp2y = i.type === "S" ? i.cpy : cy + i.cpdy;
				// svg-path-properties reflects as 2 * cur - c for S and as
				// cur + (end of previous curve) - c for s; both are kept.
				const cp1x = smooth ? (i.type === "S" ? 2 * cx - lastCx : cx + cx - lastCx) : cx;
				const cp1y = smooth ? (i.type === "S" ? 2 * cy - lastCy : cy + cy - lastCy) : cy;
				segment = bezierSegment([cx, cp1x, cp2x, endX], [cy, cp1y, cp2y, endY]);
				lastCx = cp2x;
				lastCy = cp2y;
				cx = endX;
				cy = endY;
				break;
			}
			case "Q":
				if (cx === i.cpx && cy === i.cpy) {
					segment = lineSegment(i.cpx, i.cpy, i.x, i.y);
				} else {
					segment = bezierSegment([cx, i.cpx, i.x], [cy, i.cpy, i.y]);
					lastCx = i.x;
					lastCy = i.y;
				}
				prevX = i.cpx;
				prevY = i.cpy;
				cx = i.x;
				cy = i.y;
				break;
			case "q":
				segment =
					i.cpdx === 0 && i.cpdy === 0
						? lineSegment(cx + i.cpdx, cy + i.cpdy, cx + i.dx, cy + i.dy)
						: bezierSegment([cx, cx + i.cpdx, cx + i.dx], [cy, cy + i.cpdy, cy + i.dy]);
				if (!(i.cpdx === 0 && i.cpdy === 0)) {
					lastCx = cx + i.dx;
					lastCy = cy + i.dy;
				}
				prevX = cx + i.cpdx;
				prevY = cy + i.cpdy;
				cx = i.dx + cx;
				cy = i.dy + cy;
				break;
			case "T":
			case "t": {
				const smooth = previous === "Q" || previous === "q" || previous === "T" || previous === "t";
				const endX = i.type === "T" ? i.x : cx + i.dx;
				const endY = i.type === "T" ? i.y : cy + i.dy;
				const qx = 2 * cx - prevX;
				const qy = 2 * cy - prevY;
				if (smooth) {
					segment = bezierSegment([cx, qx, endX], [cy, qy, endY]);
					lastCx = endX;
					lastCy = endY;
					prevX = qx;
					prevY = qy;
				} else {
					// Without a previous quadratic the control point is the
					// current point (SVG spec), which the next T reflects.
					segment = lineSegment(cx, cy, endX, endY);
					prevX = cx;
					prevY = cy;
				}
				cx = i.type === "T" ? i.x : i.dx + cx;
				cy = i.type === "T" ? i.y : i.dy + cy;
				break;
			}
			case "A":
			case "a": {
				const endX = i.type === "A" ? i.x : cx + i.dx;
				const endY = i.type === "A" ? i.y : cy + i.dy;
				segment = arcSegment({
					x0: cx,
					y0: cy,
					rx: i.rx,
					ry: i.ry,
					xAxisRotation: i.xAxisRotation,
					largeArc: i.largeArcFlag,
					sweep: i.sweepFlag,
					x1: endX,
					y1: endY,
				});
				cx = endX;
				cy = endY;
				break;
			}
		}
		if (added !== null) length += added;
		else if (segment !== null) length += segment.length;
		segments.push(segment);
		partialLengths.push(length);
	});
	return { segments, partialLengths, length, initialPoint };
};

/** The instruction at a length along the path, and the length into it. */
export const partAtLength = (
	properties: PathProperties,
	atLength: number,
): { index: number; lengthIntoInstruction: number } => {
	const { partialLengths } = properties;
	let fraction = atLength;
	if (fraction < 0) {
		throw new Error(`Length ${atLength} is negative: pass a length from 0 to the path's length.`);
	}
	if (fraction > properties.length) fraction = properties.length;
	let i = partialLengths.length - 1;
	while ((partialLengths[i] as number) >= fraction && i > 0) i--;
	i++;
	return { index: i, lengthIntoInstruction: fraction - (partialLengths[i - 1] as number) };
};
