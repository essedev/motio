// Bounding box of an SVG path. The extremum formulas for quadratic and cubic
// Bézier curves are ported from svg-path-bbox
// (https://github.com/mondeja/svg-path-bbox), which takes them from SVGPathy:
//
// BSD 3-Clause License
//
// Copyright (c) 2020-2024, Álvaro Mondéjar Rubio
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice, this
//    list of conditions and the following disclaimer.
//
// 2. Redistributions in binary form must reproduce the above copyright notice,
//    this list of conditions and the following disclaimer in the documentation
//    and/or other materials provided with the distribution.
//
// 3. Neither the name of the copyright holder nor the names of its
//    contributors may be used to endorse or promote products derived from
//    this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
// FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
// DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
// SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
// CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
// OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
// Changes: TypeScript, applied to reduced instructions (M, L, C, Z); the
// quadratic case tests the extremum parameter for (0, 1) and keeps the
// endpoints when rounding puts the extremum inside them, which matches
// Remotion's outputs bit for bit.

import type { Instruction } from "./instruction.js";
import { parsePath } from "./parse-path.js";
import { reduceInstructions } from "./reduce-instructions.js";

/** Bounding box of a path, compatible with Remotion's `BoundingBox` type. */
export type BoundingBox = {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	viewBox: string;
	width: number;
	height: number;
};

// Below this, the cubic coefficient is treated as zero (quadratic polynomial).
const CUBIC_EPSILON = 0.00000001;

const minMaxQuadratic = (a0: number, a1: number, a2: number): [number, number] => {
	const min = Math.min(a0, a2);
	const max = Math.max(a0, a2);
	// Parameter of the extremum; none strictly inside (0, 1) means the
	// endpoints bound the curve.
	const t = (a0 - a1) / (a0 - 2 * a1 + a2);
	if (!(t > 0 && t < 1)) return [min, max];
	const e = (a0 * a2 - a1 * a1) / (a0 - 2 * a1 + a2);
	return [Math.min(min, e), Math.max(max, e)];
};

const minMaxCubic = (a0: number, a1: number, a2: number, a3: number): [number, number] => {
	const k = a0 - 3 * a1 + 3 * a2 - a3;
	if (Math.abs(k) < CUBIC_EPSILON) {
		if (a0 === a3 && a0 === a1) return [a0, a3];
		return minMaxQuadratic(a0, -0.5 * a0 + 1.5 * a1, a0 - 3 * a1 + 3 * a2);
	}
	// Reduced discriminant of the derivative.
	const t = -a0 * a2 + a0 * a3 - a1 * a2 - a1 * a3 + a1 * a1 + a2 * a2;
	if (t <= 0) return [Math.min(a0, a3), Math.max(a0, a3)];
	const s = Math.sqrt(t);
	let min = Math.min(a0, a3);
	let max = Math.max(a0, a3);
	const l = a0 - 2 * a1 + a2;
	for (const r of [(l + s) / k, (l - s) / k]) {
		if (r > 0 && r < 1) {
			const q =
				a0 * (1 - r) * (1 - r) * (1 - r) +
				a1 * 3 * (1 - r) * (1 - r) * r +
				a2 * 3 * (1 - r) * r * r +
				a3 * r * r * r;
			if (q < min) min = q;
			if (q > max) max = q;
		}
	}
	return [min, max];
};

/** Bounding box of instructions (relative ones allowed). */
export const getBoundingBoxFromInstructions = (instructions: Instruction[]): BoundingBox => {
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	let x = 0;
	let y = 0;
	let startX = 0;
	let startY = 0;
	for (const i of reduceInstructions(instructions)) {
		switch (i.type) {
			case "M":
			case "L":
				if (minX > i.x) minX = i.x;
				if (minY > i.y) minY = i.y;
				if (maxX < i.x) maxX = i.x;
				if (maxY < i.y) maxY = i.y;
				if (i.type === "M") {
					startX = i.x;
					startY = i.y;
				}
				x = i.x;
				y = i.y;
				break;
			case "C": {
				const [cMinX, cMaxX] = minMaxCubic(x, i.cp1x, i.cp2x, i.x);
				if (minX > cMinX) minX = cMinX;
				if (maxX < cMaxX) maxX = cMaxX;
				const [cMinY, cMaxY] = minMaxCubic(y, i.cp1y, i.cp2y, i.y);
				if (minY > cMinY) minY = cMinY;
				if (maxY < cMaxY) maxY = cMaxY;
				x = i.x;
				y = i.y;
				break;
			}
			case "Z":
				x = startX;
				y = startY;
				break;
		}
	}
	return {
		x1: minX,
		y1: minY,
		x2: maxX,
		y2: maxY,
		viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`,
		width: maxX - minX,
		height: maxY - minY,
	};
};

/**
 * Bounding box of an SVG path, compatible with Remotion's `getBoundingBox()`:
 * the smallest rectangle containing the whole shape, with a ready-made
 * `viewBox` string. Throws on malformed path data.
 *
 * @example getBoundingBox("M 10 10 L 20 30").viewBox // "10 10 10 20"
 */
export const getBoundingBox = (path: string): BoundingBox =>
	getBoundingBoxFromInstructions(parsePath(path));
