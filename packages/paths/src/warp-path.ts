// Warps an SVG path by remapping its coordinates. The subdivision strategy
// (split each segment in halves until its chord is under a threshold, then
// remap every point) is ported from WarpJS (https://github.com/benjamminf/warpjs),
// which Remotion documents as the basis of warpPath():
//
// The MIT License (MIT)
//
// Copyright (c) 2016 Benjamin Fleming
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//
// Changes: TypeScript, applied to reduced instructions (M, L, C, Z), with a
// functional API; a close is warped as a line back to the subpath start and
// kept as a close.

import { getBoundingBoxFromInstructions } from "./get-bounding-box.js";
import type { Point, ReducedInstruction } from "./instruction.js";
import { parsePath } from "./parse-path.js";
import { reduceInstructions } from "./reduce-instructions.js";
import { serializeInstructions } from "./serialize-instructions.js";

/** Remaps one point of a path, compatible with Remotion's `WarpPathFn` type. */
export type WarpPathFn = (point: Point) => Point;

/** Options of `warpPath()`. */
export type WarpPathOptions = {
	/**
	 * Segments are halved until their chord is at most this long, in SVG units.
	 * Defaults to 1% of the larger side of the bounding box.
	 */
	interpolationThreshold?: number;
};

type Pt = [number, number];

/** Splits a Bézier given by its points in two at t = 0.5 (de Casteljau). */
const split = (points: Pt[]): [Pt[], Pt[]] => {
	const orders: Pt[][] = [points];
	while (orders.length < points.length) {
		const q = orders[orders.length - 1] as Pt[];
		const r: Pt[] = [];
		for (let i = 1; i < q.length; i++) {
			const q0 = q[i - 1] as Pt;
			const q1 = q[i] as Pt;
			r.push([q0[0] + (q1[0] - q0[0]) * 0.5, q0[1] + (q1[1] - q0[1]) * 0.5]);
		}
		orders.push(r);
	}
	const first: Pt[] = [];
	const second: Pt[] = [];
	for (let i = 0; i < orders.length; i++) {
		first.push((orders[i] as Pt[])[0] as Pt);
		second.push((orders[orders.length - 1 - i] as Pt[])[i] as Pt);
	}
	return [first, second];
};

const chord = (points: Pt[]): number => {
	const start = points[0] as Pt;
	const end = points[points.length - 1] as Pt;
	return Math.sqrt((end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2);
};

/** Halves the curve until every piece's chord is within the threshold. */
const subdivide = (points: Pt[], threshold: number): Pt[][] => {
	const stack = [points];
	const pieces: Pt[][] = [];
	while (stack.length > 0) {
		const current = stack.pop() as Pt[];
		if (chord(current) > threshold) {
			const [a, b] = split(current);
			stack.push(b, a);
		} else {
			pieces.push(current);
		}
	}
	return pieces;
};

const toInstruction = (points: Pt[]): ReducedInstruction => {
	const end = points[points.length - 1] as Pt;
	if (points.length === 4) {
		const [, c1, c2] = points as [Pt, Pt, Pt, Pt];
		return { type: "C", cp1x: c1[0], cp1y: c1[1], cp2x: c2[0], cp2y: c2[1], x: end[0], y: end[1] };
	}
	return { type: "L", x: end[0], y: end[1] };
};

/**
 * Remaps the coordinates of an SVG path with `fn`, compatible with Remotion's
 * `warpPath()`. Segments are first subdivided (see `interpolationThreshold`)
 * so that the warp follows the remapping smoothly; the result is made of `M`,
 * `L`, `C` and `Z` instructions and is much longer than the input. Throws on
 * malformed path data.
 *
 * @example warpPath("M 0 0 L 0 100", ({x, y}) => ({x: x + Math.sin(y / 4) * 5, y}))
 */
export const warpPath = (path: string, fn: WarpPathFn, options?: WarpPathOptions): string => {
	const reduced = reduceInstructions(parsePath(path));
	const subdivided: ReducedInstruction[] = [];
	// A close becomes an explicit line back to the start of the subpath (so it
	// is warped too) followed by the close itself.
	let previous: Pt = [0, 0];
	let start: Pt = [0, 0];
	const expanded: ReducedInstruction[] = [];
	for (const i of reduced) {
		if (i.type === "Z") expanded.push({ type: "L", x: start[0], y: start[1] });
		else if (i.type === "M") start = [i.x, i.y];
		expanded.push(i);
	}
	const box = getBoundingBoxFromInstructions(expanded);
	const threshold = options?.interpolationThreshold ?? Math.max(box.width, box.height) * 0.01;
	for (const i of expanded) {
		if (i.type === "L" || i.type === "C") {
			const points: Pt[] = [previous];
			if (i.type === "C") points.push([i.cp1x, i.cp1y], [i.cp2x, i.cp2y]);
			points.push([i.x, i.y]);
			const pieces = subdivide(points, threshold);
			if (pieces.length > 1) subdivided.push(...pieces.map(toInstruction));
			else subdivided.push(i);
		} else {
			subdivided.push(i);
		}
		if (i.type !== "Z") previous = [i.x, i.y];
	}
	const warped = subdivided.map((i): ReducedInstruction => {
		if (i.type === "Z") return i;
		if (i.type === "C") {
			const c1 = fn({ x: i.cp1x, y: i.cp1y });
			const c2 = fn({ x: i.cp2x, y: i.cp2y });
			const end = fn({ x: i.x, y: i.y });
			return { type: "C", cp1x: c1.x, cp1y: c1.y, cp2x: c2.x, cp2y: c2.y, x: end.x, y: end.y };
		}
		const p = fn({ x: i.x, y: i.y });
		return { type: i.type, x: p.x, y: p.y };
	});
	return serializeInstructions(warped);
};
