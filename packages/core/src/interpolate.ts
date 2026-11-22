import type { EasingFunction } from "./easing.js";

/**
 * What `interpolate()` does with an input outside the input range:
 * - `extend`: keep interpolating along the outer segment (the default).
 * - `clamp`: return the output value at the nearest end of the range.
 * - `identity`: return the input unchanged.
 * - `wrap`: loop the input over the whole input range.
 */
export type ExtrapolateType = "extend" | "clamp" | "identity" | "wrap";

/** Options of `interpolate()` and the shared part of `interpolateColors()`. */
export type InterpolateOptions = {
	/**
	 * Easing applied to the progress within each segment: one function for all
	 * segments, or one per segment (length `inputRange.length - 1`).
	 * Defaults to linear.
	 */
	easing?: EasingFunction | readonly EasingFunction[] | undefined;
	/** Extrapolation below the first input value. Defaults to `extend`. */
	extrapolateLeft?: ExtrapolateType | undefined;
	/** Extrapolation above the last input value. Defaults to `extend`. */
	extrapolateRight?: ExtrapolateType | undefined;
	/**
	 * Quantises the input to multiples of this step before interpolating, for a
	 * stop-motion look: with 3, inputs 0, 1 and 2 all use the value at 0.
	 */
	posterize?: number | undefined;
};

const linear: EasingFunction = (t) => t;

const formatRange = (range: readonly number[]) => `[${range.join(",")}]`;

/** Validates the ranges shared by `interpolate()` and `interpolateColors()`. */
export const validateInputRange = (inputRange: readonly number[]): void => {
	if (inputRange.length < 1) {
		throw new Error("inputRange must have at least 1 element");
	}
	if (!inputRange.every(Number.isFinite)) {
		throw new Error(
			`inputRange must contain only finite numbers, but got ${formatRange(inputRange)}`,
		);
	}
	for (let i = 1; i < inputRange.length; i++) {
		if (!((inputRange[i] as number) > (inputRange[i - 1] as number))) {
			throw new Error(
				`inputRange must be strictly monotonically increasing but got ${formatRange(inputRange)}`,
			);
		}
	}
};

/** Resolves the `easing` option into one easing function per segment. */
export const resolveEasings = (
	easing: InterpolateOptions["easing"],
	segmentCount: number,
): ((segment: number) => EasingFunction) => {
	if (easing === undefined) return () => linear;
	if (typeof easing === "function") return () => easing;
	if (easing.length !== segmentCount) {
		throw new Error(
			`When easing is an array, it must have one entry per segment between keyframes (length inputRange.length - 1 = ${segmentCount}), but got length ${easing.length}`,
		);
	}
	return (segment) => easing[segment] ?? linear;
};

/** Validates `posterize` and returns the function that quantises the input. */
export const resolvePosterize = (posterize: number | undefined): ((input: number) => number) => {
	if (posterize === undefined) return (input) => input;
	if (!(Number.isFinite(posterize) && posterize > 0)) {
		throw new Error(`posterize must be a positive finite number, but got ${posterize}`);
	}
	return (input) => Math.floor(input / posterize) * posterize;
};

/**
 * Index of the segment whose interpolation applies to `input`: the first
 * segment whose upper end is at or above it, or the outer segments for inputs
 * outside the range.
 */
export const findSegment = (input: number, inputRange: readonly number[]): number => {
	let i = 1;
	for (; i < inputRange.length - 1; i++) {
		if ((inputRange[i] as number) >= input) break;
	}
	return i - 1;
};

/** Maps an input into [first, last] by repeating the whole input range. */
const wrapInput = (input: number, first: number, last: number) => {
	const span = last - first;
	return first + ((((input - first) % span) + span) % span);
};

/**
 * Progress of `input` within the segment [inMin, inMax], after extrapolation,
 * or `{ identity }` when the extrapolation returns the input itself.
 */
const segmentProgress = (
	input: number,
	inMin: number,
	inMax: number,
	left: ExtrapolateType,
	right: ExtrapolateType,
): number | { identity: number } => {
	let value = input;
	if (value < inMin) {
		if (left === "identity") return { identity: value };
		if (left === "clamp") value = inMin;
	}
	if (value > inMax) {
		if (right === "identity") return { identity: value };
		if (right === "clamp") value = inMax;
	}
	return (value - inMin) / (inMax - inMin);
};

/**
 * Maps `input` from `inputRange` to `outputRange`, piecewise linearly between
 * keyframes, with optional easing per segment and a choice of extrapolation
 * on each side. Compatible with Remotion's numeric `interpolate()`.
 *
 * `inputRange` must be strictly increasing, both ranges must have the same
 * non-zero length and contain only finite numbers. With a single keyframe the
 * only output value is returned. Throws an `Error` with the same message as
 * Remotion on invalid arguments.
 *
 * @example interpolate(10, [0, 20], [0, 1]) // 0.5
 */
export const interpolate = (
	input: number,
	inputRange: readonly number[],
	outputRange: readonly number[],
	options?: InterpolateOptions,
): number => {
	if (typeof input === "undefined") {
		throw new Error("input can not be undefined");
	}
	if (typeof input !== "number") {
		throw new TypeError("Cannot interpolate an input which is not a number");
	}
	if (inputRange.length !== outputRange.length) {
		throw new Error(
			`inputRange (${inputRange.length}) and outputRange (${outputRange.length}) must have the same length`,
		);
	}
	validateInputRange(inputRange);
	if (!outputRange.every(Number.isFinite)) {
		throw new Error(
			`outputRange must contain only finite numbers, but got ${formatRange(outputRange)}`,
		);
	}
	const easingFor = resolveEasings(options?.easing, inputRange.length - 1);
	const posterize = resolvePosterize(options?.posterize);

	if (inputRange.length === 1) return outputRange[0] as number;

	const left = options?.extrapolateLeft ?? "extend";
	const right = options?.extrapolateRight ?? "extend";
	const first = inputRange[0] as number;
	const last = inputRange[inputRange.length - 1] as number;

	let x = posterize(input);
	if ((x < first && left === "wrap") || (x > last && right === "wrap")) {
		x = wrapInput(x, first, last);
	}

	const segment = findSegment(x, inputRange);
	const inMin = inputRange[segment] as number;
	const inMax = inputRange[segment + 1] as number;
	const outMin = outputRange[segment] as number;
	const outMax = outputRange[segment + 1] as number;

	const progress = segmentProgress(x, inMin, inMax, left, right);
	if (typeof progress !== "number") return progress.identity;
	if (outMin === outMax) return outMin;
	return outMin + easingFor(segment)(progress) * (outMax - outMin);
};
