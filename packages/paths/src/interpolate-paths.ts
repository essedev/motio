import type { EasingFunction } from "@motiojs/core";
import type { ReducedInstruction } from "./instruction.js";
import { extend } from "./interpolate-path.js";
import { parsePath } from "./parse-path.js";
import { reduceInstructions } from "./reduce-instructions.js";
import { serializeInstructions } from "./serialize-instructions.js";

/** Extrapolation of `interpolatePaths()` outside the input range. */
export type InterpolatePathsExtrapolateType = "extend" | "clamp" | "wrap";

/** Options of `interpolatePaths()`, as for `interpolate()`. */
export type InterpolatePathsOptions = {
	/** One easing for every segment, or one per segment. Defaults to linear. */
	easing?: EasingFunction | readonly EasingFunction[] | undefined;
	/** Extrapolation before the first keyframe. Defaults to `extend`. */
	extrapolateLeft?: InterpolatePathsExtrapolateType | undefined;
	/** Extrapolation after the last keyframe. Defaults to `extend`. */
	extrapolateRight?: InterpolatePathsExtrapolateType | undefined;
	/** Rounds the input down to a multiple of this positive number first. */
	posterize?: number | undefined;
};

type Pt = [number, number];

const formatRange = (range: readonly number[]) => `[${range.join(",")}]`;

const validate = (inputRange: readonly number[], outputRange: readonly string[]) => {
	if (inputRange.length !== outputRange.length) {
		throw new Error(
			`inputRange has ${inputRange.length} values and outputRange ${outputRange.length}: give both one value per keyframe.`,
		);
	}
	if (inputRange.length < 1) throw new Error("inputRange is empty: pass at least one input value.");
	if (!inputRange.every(Number.isFinite)) {
		throw new Error(
			`inputRange ${formatRange(inputRange)} holds a value that is not a finite number: every input value must be finite.`,
		);
	}
	for (let i = 1; i < inputRange.length; i++) {
		if (!((inputRange[i] as number) > (inputRange[i - 1] as number))) {
			throw new Error(
				`inputRange ${formatRange(inputRange)} is not strictly increasing: each value must be greater than the one before it.`,
			);
		}
	}
};

// Segment and eased progress with the same rules as interpolate(): posterize,
// wrap over the whole range, the first segment whose upper end reaches the
// input, clamp or extend outside.
const locate = (
	input: number,
	inputRange: readonly number[],
	options: InterpolatePathsOptions | undefined,
): { segment: number; progress: number } => {
	const left = options?.extrapolateLeft ?? "extend";
	const right = options?.extrapolateRight ?? "extend";
	const posterize = options?.posterize;
	if (posterize !== undefined && !(Number.isFinite(posterize) && posterize > 0)) {
		throw new Error(
			`posterize is ${String(posterize)}: use a positive finite step, or leave it out.`,
		);
	}
	const segments = inputRange.length - 1;
	const easing = options?.easing;
	if (easing !== undefined && typeof easing !== "function" && easing.length !== segments) {
		throw new Error(
			`easing is an array of length ${easing.length}, but inputRange has ${segments} segments between its values: pass one easing per segment, or a single function.`,
		);
	}
	const first = inputRange[0] as number;
	const last = inputRange[segments] as number;
	let x = posterize === undefined ? input : Math.floor(input / posterize) * posterize;
	if ((x < first && left === "wrap") || (x > last && right === "wrap")) {
		const span = last - first;
		x = first + ((((x - first) % span) + span) % span);
	}
	let i = 1;
	for (; i < segments; i++) if ((inputRange[i] as number) >= x) break;
	const segment = i - 1;
	const inMin = inputRange[segment] as number;
	const inMax = inputRange[segment + 1] as number;
	if (x < inMin && left === "clamp") x = inMin;
	if (x > inMax && right === "clamp") x = inMax;
	const raw = (x - inMin) / (inMax - inMin);
	const ease =
		easing === undefined
			? (t: number) => t
			: typeof easing === "function"
				? easing
				: (easing[segment] as EasingFunction);
	return { segment, progress: ease(raw) };
};

const endOf = (i: ReducedInstruction, start: Pt): Pt => (i.type === "Z" ? start : [i.x, i.y]);

const asCubic = (i: ReducedInstruction, start: Pt): Extract<ReducedInstruction, { type: "C" }> => {
	if (i.type === "C") return i;
	const [x, y] = endOf(i, start);
	return { type: "C", cp1x: start[0], cp1y: start[1], cp2x: x, cp2y: y, x, y };
};

// Results are rounded to 15 significant digits, as Remotion does.
const round = (value: number): number => Number(value.toPrecision(15));
const mix = (a: number, b: number, t: number) => round(a + (b - a) * t);

const STRUCTURE_ERROR =
	"The paths in outputRange have different subpaths (moves and closes): give every path the same number of subpaths, closed in the same places.";

/**
 * Matches the two command lists the way d3-interpolate-path does (the shorter
 * one is extended by splitting segments evenly), requires moves and closes to
 * line up, and interpolates: lines stay lines, anything else becomes a cubic.
 */
const interpolateMatched = (
	aInput: ReducedInstruction[],
	bInput: ReducedInstruction[],
	t: number,
): ReducedInstruction[] => {
	let a = aInput.slice();
	let b = bInput.slice();
	const addZ = a[a.length - 1]?.type === "Z" && b[b.length - 1]?.type === "Z";
	if (a[a.length - 1]?.type === "Z") a.pop();
	if (b[b.length - 1]?.type === "Z") b.pop();
	const count = (list: ReducedInstruction[], type: "M" | "Z") =>
		list.filter((i) => i.type === type).length;
	if (a.length === 0 || b.length === 0) {
		// Remotion fails with a TypeError when a path is only a close.
		throw new TypeError(
			"A path in outputRange holds only a close (Z): give every path a move and at least one drawing command.",
		);
	}
	if (count(a, "M") !== count(b, "M") || count(a, "Z") !== count(b, "Z")) {
		throw new TypeError(STRUCTURE_ERROR);
	}
	// Remotion fails with a TypeError when the first path has to be split
	// after a close; extend() reproduces it.
	if (b.length > a.length) a = extend(a, b, true);
	else if (a.length > b.length) b = extend(b, a);
	a.forEach((ca, i) => {
		const cb = b[i] as ReducedInstruction;
		if ((ca.type === "M") !== (cb.type === "M") || (ca.type === "Z") !== (cb.type === "Z")) {
			throw new TypeError(STRUCTURE_ERROR);
		}
	});
	const out: ReducedInstruction[] = [];
	let fromA: Pt = [0, 0];
	let fromB: Pt = [0, 0];
	let startA: Pt = [0, 0];
	let startB: Pt = [0, 0];
	a.forEach((ca, i) => {
		const cb = b[i] as ReducedInstruction;
		if (ca.type === "Z" || cb.type === "Z") {
			out.push({ type: "Z" });
			fromA = startA;
			fromB = startB;
			return;
		}
		if ((ca.type === "M" || ca.type === "L") && ca.type === cb.type) {
			out.push({ type: ca.type, x: mix(ca.x, cb.x, t), y: mix(ca.y, cb.y, t) });
		} else {
			const x = asCubic(ca, fromA);
			const y = asCubic(cb, fromB);
			out.push({
				type: "C",
				cp1x: mix(x.cp1x, y.cp1x, t),
				cp1y: mix(x.cp1y, y.cp1y, t),
				cp2x: mix(x.cp2x, y.cp2x, t),
				cp2y: mix(x.cp2y, y.cp2y, t),
				x: mix(x.x, y.x, t),
				y: mix(x.y, y.y, t),
			});
		}
		fromA = [ca.x, ca.y];
		fromB = [cb.x, cb.y];
		if (ca.type === "M") startA = fromA;
		if (cb.type === "M") startB = fromB;
	});
	if (addZ) out.push({ type: "Z" });
	return out;
};

/**
 * Interpolates SVG paths across keyframes, compatible with Remotion's
 * `interpolatePaths()`: the same input range, easing, extrapolation and
 * posterization rules as `interpolate()`, with a path per keyframe. Paths may
 * have different numbers of points, but their subpaths (moves and closes)
 * must correspond; a line morphing into a curve becomes a cubic. A keyframe is
 * returned unchanged when the input lands exactly on it.
 *
 * @example interpolatePaths(frame, [0, 30], ["M 0 0 L 100 0", "M 0 0 L 100 100"])
 */
export const interpolatePaths = (
	input: number,
	inputRange: readonly number[],
	outputRange: readonly string[],
	options?: InterpolatePathsOptions,
): string => {
	validate(inputRange, outputRange);
	if (inputRange.length === 1) return outputRange[0] as string;
	const { segment, progress } = locate(input, inputRange, options);
	const from = outputRange[segment] as string;
	const to = outputRange[segment + 1] as string;
	if (progress === 0) return from;
	if (progress === 1) return to;
	const a = reduceInstructions(parsePath(from));
	const b = reduceInstructions(parsePath(to));
	return serializeInstructions(interpolateMatched(a, b, progress));
};
