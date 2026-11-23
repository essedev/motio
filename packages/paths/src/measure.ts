import type { Point } from "./instruction.js";
import { parsePath } from "./parse-path.js";
import {
	measureInstructions,
	type PathProperties,
	partAtLength,
} from "./properties/path-properties.js";

// Measuring a path is costly (arcs are sampled 300 times), and animations
// measure the same path on every frame, so recent results are cached.
const MAX_CACHED = 64;
const cache = new Map<string, PathProperties>();

/** Measures a path string, with a small cache. Throws on malformed path data. */
export const measurePath = (path: string): PathProperties => {
	const cached = cache.get(path);
	if (cached !== undefined) return cached;
	const measured = measureInstructions(parsePath(path));
	if (cache.size >= MAX_CACHED) cache.clear();
	cache.set(path, measured);
	return measured;
};

/**
 * Length of an SVG path, compatible with Remotion's `getLength()`.
 * Throws on malformed path data.
 *
 * @example getLength("M 0 0 L 100 0") // 100
 */
export const getLength = (path: string): number => measurePath(path).length;

const noPointAt = (path: string, length: number) =>
	`"${path}" has no point at length ${length}: it has no drawing command and no starting move.`;

/**
 * Coordinates of the point at a length along an SVG path, compatible with
 * Remotion's `getPointAtLength()`. Returns null when the length is beyond the
 * end of the path. Throws on malformed path data.
 *
 * @example getPointAtLength("M 0 0 L 100 0", 50) // {x: 50, y: 0}
 */
export const getPointAtLength = (path: string, length: number): Point | null => {
	const properties = measurePath(path);
	if (length > properties.length) return null;
	const { index, lengthIntoInstruction } = partAtLength(properties, length);
	const segment = properties.segments[index];
	if (segment) return segment.pointAt(lengthIntoInstruction);
	if (properties.initialPoint !== null) return properties.initialPoint;
	throw new Error(noPointAt(path, length));
};

/**
 * Unit tangent at a length along an SVG path, compatible with Remotion's
 * `getTangentAtLength()`. Returns null when the length is beyond the end of
 * the path. Throws on malformed path data.
 *
 * @example getTangentAtLength("M 50 50 L 150 50", 50) // {x: 1, y: 0}
 */
export const getTangentAtLength = (path: string, length: number): Point | null => {
	const properties = measurePath(path);
	if (length > properties.length) return null;
	const { index, lengthIntoInstruction } = partAtLength(properties, length);
	const segment = properties.segments[index];
	if (segment) return segment.tangentAt(lengthIntoInstruction);
	if (properties.initialPoint !== null) return { x: 0, y: 0 };
	throw new Error(noPointAt(path, length));
};

/**
 * Index of the instruction (as returned by `parsePath()`) at a length along an
 * SVG path, and how far into that instruction the length falls, compatible
 * with Remotion's `getInstructionIndexAtLength()`. Throws if the length is
 * beyond the end of the path or the path is malformed.
 *
 * @example getInstructionIndexAtLength("M 0 0 L 100 0 L 200 0", 105) // {index: 1, lengthIntoInstruction: 5}
 */
export const getInstructionIndexAtLength = (
	path: string,
	length: number,
): { lengthIntoInstruction: number; index: number } => {
	const properties = measurePath(path);
	if (length > properties.length) {
		throw new Error(
			`getInstructionIndexAtLength() got length ${length}, past the end of the path (${properties.length}): pass a length up to getLength(path).`,
		);
	}
	const { index, lengthIntoInstruction } = partAtLength(properties, length);
	return { lengthIntoInstruction, index: index - 1 };
};
