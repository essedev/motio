// Interpolation between two SVG paths. The point-matching strategy (extend
// the path with fewer segments by splitting its segments evenly, then convert
// each command to the type of its counterpart) is ported from
// d3-interpolate-path (https://github.com/pbeshai/d3-interpolate-path), which
// Remotion documents as the origin of its implementation:
//
// Copyright 2016, Peter Beshai
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
// * Redistributions of source code must retain the above copyright notice,
//   this list of conditions and the following disclaimer.
//
// * Redistributions in binary form must reproduce the above copyright notice,
//   this list of conditions and the following disclaimer in the documentation
//   and/or other materials provided with the distribution.
//
// * Neither the name of the author nor the names of contributors may be used to
//   endorse or promote products derived from this software without specific
//   prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE
// FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
// DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
// SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
// CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
// OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
// Changes: TypeScript over Motio's reduced instructions (M, L, C, Z); a line
// becomes a cubic with its control points on its ends; incompatible moves and
// closes throw instead of producing a broken path.

import type { ReducedInstruction } from "./instruction.js";
import { parsePath } from "./parse-path.js";
import { reduceInstructions } from "./reduce-instructions.js";
import { serializeInstructions } from "./serialize-instructions.js";

type Pt = [number, number];

const endOf = (i: ReducedInstruction): Pt =>
	i.type === "Z" ? [Number.NaN, Number.NaN] : [i.x, i.y];

const decasteljau = (points: Pt[], t: number): { left: Pt[]; right: Pt[] } => {
	const left: Pt[] = [];
	const right: Pt[] = [];
	const recurse = (pts: Pt[]) => {
		if (pts.length === 1) {
			left.push(pts[0] as Pt);
			right.push(pts[0] as Pt);
			return;
		}
		const next: Pt[] = [];
		for (let i = 0; i < pts.length - 1; i++) {
			if (i === 0) left.push(pts[0] as Pt);
			if (i === pts.length - 2) right.push(pts[i + 1] as Pt);
			const a = pts[i] as Pt;
			const b = pts[i + 1] as Pt;
			next.push([(1 - t) * a[0] + t * b[0], (1 - t) * a[1] + t * b[1]]);
		}
		recurse(next);
	};
	if (points.length > 0) recurse(points);
	return { left, right: right.reverse() };
};

const pointsToInstruction = (points: Pt[]): ReducedInstruction => {
	const end = points[points.length - 1] as Pt;
	if (points.length === 4) {
		const [, c1, c2] = points as [Pt, Pt, Pt, Pt];
		return { type: "C", cp1x: c1[0], cp1y: c1[1], cp2x: c2[0], cp2y: c2[1], x: end[0], y: end[1] };
	}
	return { type: "L", x: end[0], y: end[1] };
};

/** Splits the segment from `start` into `count` pieces of equal parameter span. */
const splitCurve = (start: ReducedInstruction, end: ReducedInstruction, count: number) => {
	const points: Pt[] = [endOf(start)];
	if (end.type === "C") points.push([end.cp1x, end.cp1y], [end.cp2x, end.cp2y]);
	points.push(endOf(end));
	const pieces: Pt[][] = [];
	let remaining = points;
	const step = 1 / count;
	for (let i = 0; i < count - 1; i++) {
		const split = decasteljau(remaining, step / (1 - step * i));
		pieces.push(split.left);
		remaining = split.right;
	}
	pieces.push(remaining);
	return pieces.map(pointsToInstruction);
};

const asLine = (i: ReducedInstruction): ReducedInstruction =>
	i.type === "M" ? { type: "L", x: i.x, y: i.y } : { ...i };

const splitSegment = (
	start: ReducedInstruction,
	end: ReducedInstruction,
	count: number,
	subpathStart: Pt,
	failAfterClose: boolean,
) => {
	if (end.type === "L" || end.type === "C") {
		if (start.type === "Z" && failAfterClose) {
			// Remotion's interpolatePath() fails with a TypeError when a segment after
			// a close has to be split in the second path; Motio throws one too.
			throw new TypeError(
				"The second path draws after a close (Z) without a move (M), so its segments cannot be split to match the first path: start each subpath with M.",
			);
		}
		const from: ReducedInstruction =
			start.type === "Z" ? { type: "M", x: subpathStart[0], y: subpathStart[1] } : start;
		return splitCurve(from, end, count);
	}
	const copies: ReducedInstruction[] = [];
	for (let i = 0; i < count - 1; i++) copies.push(asLine(start));
	copies.push(end);
	return copies;
};

/**
 * Extends `commands` to the length of `reference` by splitting its segments
 * evenly; the first command is kept as the anchor.
 */
export const extend = (
	commands: ReducedInstruction[],
	reference: ReducedInstruction[],
	failAfterClose = false,
) => {
	const segments = commands.length - 1;
	const referenceSegments = reference.length - 1;
	const ratio = segments / referenceSegments;
	const counts: number[] = [];
	for (let i = 0; i < referenceSegments; i++) {
		const index = Math.floor(ratio * i);
		counts[index] = (counts[index] ?? 0) + 1;
	}
	const extended: ReducedInstruction[] = [commands[0] as ReducedInstruction];
	// Start of the subpath each command belongs to (where a close returns).
	const subpathStarts: Pt[] = [];
	let subpathStart: Pt = [0, 0];
	for (const command of commands) {
		if (command.type === "M") subpathStart = [command.x, command.y];
		subpathStarts.push(subpathStart);
	}
	counts.forEach((count, i) => {
		if (i === commands.length - 1) {
			const last = commands[commands.length - 1] as ReducedInstruction;
			for (let k = 0; k < count; k++) extended.push(asLine(last));
			return;
		}
		extended.push(
			...splitSegment(
				commands[i] as ReducedInstruction,
				commands[i + 1] as ReducedInstruction,
				count,
				subpathStarts[i] as Pt,
				failAfterClose,
			),
		);
	});
	return extended;
};

const toCubic = (i: Extract<ReducedInstruction, { type: "L" }>, start: Pt): ReducedInstruction => ({
	type: "C",
	cp1x: start[0],
	cp1y: start[1],
	cp2x: i.x,
	cp2y: i.y,
	x: i.x,
	y: i.y,
});

/** Converts `a` to the type of `b`, as d3-interpolate-path does. */
const convertToSameType = (
	a: ReducedInstruction,
	b: ReducedInstruction,
	start: Pt,
): ReducedInstruction => {
	if (a.type === b.type) return a;
	if (b.type === "Z") return { type: "Z" };
	if (a.type === "Z" || a.type === "M" || b.type === "M") throw new Error(MOVE_MISMATCH);
	if (b.type === "L") return { type: "L", x: a.x, y: a.y };
	return a.type === "L" ? toCubic(a, start) : a;
};

const mix = (a: number, b: number, t: number) => (1 - t) * a + t * b;

const MOVE_MISMATCH =
	"The two paths cannot be matched command by command: a move (M) in one meets another command in the other. Give both paths the same subpaths.";
const CLOSE_MISMATCH =
	"The two paths cannot be matched command by command: a close (Z) in one meets a drawing command in the other. Give both paths the same subpaths.";

const interpolateInstruction = (
	a: ReducedInstruction,
	b: ReducedInstruction,
	t: number,
): ReducedInstruction => {
	if (a.type === "C" && b.type === "C") {
		return {
			type: "C",
			cp1x: mix(a.cp1x, b.cp1x, t),
			cp1y: mix(a.cp1y, b.cp1y, t),
			cp2x: mix(a.cp2x, b.cp2x, t),
			cp2y: mix(a.cp2y, b.cp2y, t),
			x: mix(a.x, b.x, t),
			y: mix(a.y, b.y, t),
		};
	}
	if ((a.type === "M" || a.type === "L") && a.type === b.type) {
		return { type: a.type, x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) };
	}
	return { type: "Z" };
};

/** Interpolates reduced instruction lists, following d3-interpolate-path. */
export const interpolateInstructions = (
	aInput: ReducedInstruction[],
	bInput: ReducedInstruction[],
	t: number,
): ReducedInstruction[] => {
	let a = aInput.slice();
	let b = bInput.slice();
	if (a.length === 0 && b.length === 0) return [];
	const addZ =
		(a.length === 0 || a[a.length - 1]?.type === "Z") &&
		(b.length === 0 || b[b.length - 1]?.type === "Z");
	if (a[a.length - 1]?.type === "Z") a.pop();
	if (b[b.length - 1]?.type === "Z") b.pop();
	if (a.length === 0) a.push(b[0] as ReducedInstruction);
	else if (b.length === 0) b.push(a[0] as ReducedInstruction);
	if (b.length > a.length) a = extend(a, b);
	else if (a.length > b.length) b = extend(b, a, true);

	// Incompatible commands are reported in the same order as Remotion: a move
	// against something else, or a close against a drawing command, in a first
	// pass; a move in the first path against a drawing command in a second.
	a.forEach((command, i) => {
		const counterpart = b[i] as ReducedInstruction;
		if (command.type === counterpart.type) return;
		if (counterpart.type === "M") throw new Error(MOVE_MISMATCH);
		if (counterpart.type !== "Z" && command.type === "Z") throw new Error(CLOSE_MISMATCH);
	});
	a.forEach((command, i) => {
		if (command.type === "M" && (b[i] as ReducedInstruction).type !== "M") {
			throw new Error(MOVE_MISMATCH);
		}
	});
	const out: ReducedInstruction[] = [];
	let current: Pt = [0, 0];
	let subpathStart: Pt = [0, 0];
	a.forEach((command, i) => {
		const counterpart = b[i] as ReducedInstruction;
		const converted = convertToSameType(command, counterpart, current);
		out.push(interpolateInstruction(converted, counterpart, t));
		if (command.type === "Z") {
			current = subpathStart;
		} else {
			current = [command.x, command.y];
			if (command.type === "M") subpathStart = current;
		}
	});
	if (addZ) out.push({ type: "Z" });
	return out;
};

/**
 * Interpolates between two SVG paths, compatible with Remotion's
 * `interpolatePath()`. `value` 0 returns `firstPath` and 1 returns
 * `secondPath` unchanged; other values (also outside [0, 1]) interpolate. The
 * paths may have different numbers of points: segments of the shorter one
 * are split. Throws on malformed path data or incompatible subpaths.
 *
 * @example interpolatePath(0.5, "M 0 0 L 100 0", "M 100 0 L 0 0") // "M 50 0 L 50 0"
 */
export const interpolatePath = (value: number, firstPath: string, secondPath: string): string => {
	if (value === 0) return firstPath;
	if (value === 1) return secondPath;
	const a = reduceInstructions(parsePath(firstPath));
	const b = reduceInstructions(parsePath(secondPath));
	return serializeInstructions(interpolateInstructions(a, b, value));
};
