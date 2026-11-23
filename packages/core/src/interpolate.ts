import { Easing, type EasingFunction } from "./easing.js";
import {
	type CssPlan,
	type InterpolateOutputType,
	looksLikeCssValue,
	planCssOutput,
} from "./interpolate-css.js";

export type { InterpolateOutputType } from "./interpolate-css.js";

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
	/**
	 * How values are distributed between keyframes, after easing. `linear`
	 * (default) is additive; `perceptual-scale` interpolates
	 * `sign(v) * v^2` (the visible area of a scale) and maps back with
	 * `sign(a) * sqrt(|a|)`, so `[0, 1]` at half way gives `sqrt(0.5)`.
	 */
	output?: InterpolateOutput | undefined;
	/**
	 * What the output range holds, when it should be enforced: CSS `scale`,
	 * `translate`, `rotate` or `transform-origin` strings, or a `font-weight`
	 * (numbers, numeric strings and the keywords `normal` and `bold`).
	 */
	outputType?: InterpolateOutputType | undefined;
};

/** The `output` option of `interpolate()`. */
export type InterpolateOutput = "linear" | "perceptual-scale";

const linear: EasingFunction = (t) => t;

const formatRange = (range: readonly number[]) => `[${range.join(",")}]`;

/** Validates the ranges shared by `interpolate()` and `interpolateColors()`. */
export const validateInputRange = (inputRange: readonly number[]): void => {
	if (inputRange.length < 1) {
		throw new Error("inputRange is empty: pass at least one input value.");
	}
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

/**
 * Throws unless `easing` is a valid `easing` option of `interpolate()` for an input range of
 * `inputRangeLength` values: `undefined`, one function, or an array with one function per
 * segment (`inputRangeLength - 1` entries). The check `interpolate()` runs on its options,
 * exported by `remotion` and `remotion/no-react` under this name. Throws where Remotion throws.
 */
export function assertValidInterpolateEasingOption(
	easing: unknown,
	inputRangeLength: number,
): void {
	if (easing === undefined || typeof easing === "function") return;
	// Read `length` like an array would: a string or object is reported by its own length,
	// `null` throws the engine's TypeError, as the published package does.
	const entries = easing as ArrayLike<unknown>;
	const segmentCount = inputRangeLength - 1;
	if (entries.length !== segmentCount) {
		throw new Error(
			`easing is an array of length ${entries.length}, but inputRange has ${segmentCount} segments between its values: pass one easing per segment, or a single function.`,
		);
	}
	for (let i = 0; i < segmentCount; i++) {
		if (typeof entries[i] !== "function") {
			throw new Error(
				`easing[${i}] is ${entries[i] === null ? "null" : `a ${typeof entries[i]}`}, not a function: each entry of an easing array must be an easing function.`,
			);
		}
	}
}

/**
 * Throws unless `posterize` is a valid `posterize` option of `interpolate()`: `undefined` or a
 * positive finite number. Exported by `remotion` and `remotion/no-react` under this name.
 */
export function assertValidInterpolatePosterizeOption(posterize: unknown): void {
	if (posterize === undefined) return;
	if (!(typeof posterize === "number" && Number.isFinite(posterize) && posterize > 0)) {
		throw new Error(
			`posterize is ${String(posterize)}: use a positive finite step, or leave it out.`,
		);
	}
}

/** Resolves the `easing` option into one easing function per segment. */
export const resolveEasings = (
	easing: InterpolateOptions["easing"],
	segmentCount: number,
): ((segment: number) => EasingFunction) => {
	assertValidInterpolateEasingOption(easing, segmentCount + 1);
	if (easing === undefined) return () => linear;
	if (typeof easing === "function") return () => easing;
	return (segment) => easing[segment] ?? linear;
};

/** Validates `posterize` and returns the function that quantises the input. */
export const resolvePosterize = (posterize: number | undefined): ((input: number) => number) => {
	assertValidInterpolatePosterizeOption(posterize);
	if (posterize === undefined) return (input) => input;
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

/** Whether `input` is outside the range on a side whose extrapolation is `identity`. */
const identitySide = (
	input: number,
	first: number,
	last: number,
	left: ExtrapolateType,
	right: ExtrapolateType,
): "Left" | "Right" | null => {
	if (input < first && left === "identity") return "Left";
	if (input > last && right === "identity") return "Right";
	return null;
};

/** Interpolates one component between two keyframe values. */
const lerp = (from: number, to: number, eased: number, perceptual: boolean): number => {
	if (from === to) return from;
	if (!perceptual) return from + eased * (to - from);
	const a = Math.sign(from) * from ** 2;
	const b = Math.sign(to) * to ** 2;
	const area = a + eased * (b - a);
	return Math.sign(area) * Math.sqrt(Math.abs(area));
};

/** Keyframe vectors of one segment. */
type SegmentVectors = { from: readonly number[]; to: readonly number[] };

/** How a resolved output range is evaluated and turned back into an output value. */
type OutputPlan<T> = {
	segment(index: number): SegmentVectors;
	/** Vector of one keyframe on its own (for a single-keyframe range). */
	keyframe(index: number): readonly number[];
	dimension: number;
	format(components: readonly number[]): T;
	/** Called when an input falls on a side whose extrapolation is `identity`. */
	identity?(side: "Left" | "Right"): void;
	/** Whether easing applies (discrete outputs only switch at keyframes). */
	perceptual: boolean;
};

const extendsRight = (easing: EasingFunction): boolean =>
	(easing as { remotionShouldExtendRight?: unknown }).remotionShouldExtendRight === true;

/**
 * The numeric core of `interpolate()`, over vectors: posterize, wrap, find the
 * segment, extrapolate, ease, then add what earlier segments whose easing
 * extends right (`Easing.spring({ allowTail: true })`) still move.
 */
const evaluate = <T>(
	input: number,
	inputRange: readonly number[],
	plan: OutputPlan<T>,
	options: InterpolateOptions | undefined,
	easingFor: (segment: number) => EasingFunction,
	posterize: (input: number) => number,
): T => {
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

	const side = identitySide(x, inMin, inMax, left, right);
	let result: number[];
	if (side !== null) {
		plan.identity?.(side);
		result = new Array<number>(plan.dimension).fill(x);
	} else {
		const easing = easingFor(segment);
		let value = x;
		if (value < inMin && left === "clamp") value = inMin;
		// An easing that extends right is not clamped: it keeps settling.
		if (value > inMax && right === "clamp" && !extendsRight(easing)) value = inMax;
		const eased = easing((value - inMin) / (inMax - inMin));
		const { from, to } = plan.segment(segment);
		result = from.map((a, i) => lerp(a, to[i] as number, eased, plan.perceptual));
	}

	for (let k = 0; k < segment; k++) {
		const easing = easingFor(k);
		if (!extendsRight(easing)) continue;
		const start = inputRange[k] as number;
		const end = inputRange[k + 1] as number;
		const eased = easing((x - start) / (end - start));
		const { from, to } = plan.segment(k);
		for (let i = 0; i < result.length; i++) {
			const a = from[i] as number;
			const b = to[i] as number;
			result[i] = (result[i] as number) + (lerp(a, b, eased, plan.perceptual) - b);
		}
	}
	return plan.format(result);
};

/** A plan whose keyframe vectors do not depend on the segment. */
const vectorPlan = <T>(
	vectors: readonly (readonly number[])[],
	format: (components: readonly number[]) => T,
	perceptual: boolean,
): OutputPlan<T> => ({
	segment: (index) => ({
		from: vectors[index] as readonly number[],
		to: vectors[index + 1] as readonly number[],
	}),
	keyframe: (index) => vectors[index] as readonly number[],
	dimension: vectors[0]?.length ?? 1,
	format,
	perceptual,
});

/** The value types `interpolate()` accepts in an output range. */
export type InterpolateOutputValue = number | string | boolean | readonly number[];

const isStep1Only = (easing: InterpolateOptions["easing"]): boolean => {
	if (easing === undefined) return false;
	if (typeof easing === "function") return easing === Easing.step1;
	return easing.every((e) => e === Easing.step1);
};

/**
 * Strings and booleans that cannot be blended: the output holds a keyframe's
 * value until the next keyframe, which only `Easing.step1` expresses.
 */
const discretePlan = <T>(
	values: readonly T[],
	options: InterpolateOptions | undefined,
	what: "non-numeric strings" | "booleans",
): OutputPlan<T> => {
	// A single keyframe is returned as it is, whatever the easing.
	if (values.length > 1 && !isStep1Only(options?.easing)) {
		throw new TypeError(
			`outputRange holds ${what}, which cannot be blended: pass easing: Easing.step1 to hold each value until the next keyframe.`,
		);
	}
	return {
		...vectorPlan(
			values.map((_, i) => [i]),
			(c) => values[c[0] as number] as T,
			false,
		),
		identity: (side) => {
			throw new TypeError(
				`extrapolate${side} "identity" returns the input number, which an outputRange of ${what} cannot do: choose another extrapolation.`,
			);
		},
	};
};

const FONT_WEIGHT_KEYWORDS: Record<string, number> = { normal: 400, bold: 700 };

const parseFontWeight = (value: number | string): number => {
	const weight =
		typeof value === "number"
			? value
			: (FONT_WEIGHT_KEYWORDS[value.toLowerCase()] ??
				(/^\d+(?:\.\d+)?$/.test(value) ? Number(value) : Number.NaN));
	if (!(weight >= 1 && weight <= 1000)) {
		throw new TypeError(
			`"${String(value)}" is not a font weight: use "normal", "bold" or a number from 1 to 1000.`,
		);
	}
	return weight;
};

const UNSUPPORTED_WITH_STRINGS =
	"outputRange mixes values that cannot be interpolated together: use numbers, or scale, translate and rotate strings.";
const UNSUPPORTED =
	"outputRange holds a value that cannot be interpolated: use numbers, numeric tuples, or scale, translate and rotate strings.";

/** Thrown for a string that is neither a CSS value nor part of an all-strings range. */
export class UnsupportedStringInterpolationValueError extends TypeError {
	constructor(value: string) {
		super(
			`"${value}" in outputRange is not a scale, translate or rotate value, so it cannot be interpolated with the numbers next to it.`,
		);
		this.name = "UnsupportedStringInterpolationValueError";
	}
}

const needsCssUnits = (outputType: InterpolateOutputType | undefined) =>
	outputType === "translate" || outputType === "rotate" || outputType === "transform-origin";

const CSS_EXAMPLES: Partial<Record<InterpolateOutputType, string>> = {
	translate: '"10px 20px"',
	rotate: '"45deg"',
	"transform-origin": '"50% 50%"',
};

const cssUnitsNeeded = (outputType: InterpolateOutputType | undefined) =>
	`outputType "${outputType}" needs outputRange strings with CSS units, such as ${CSS_EXAMPLES[outputType as InterpolateOutputType]}, not plain numbers.`;

const validateOptions = (options: InterpolateOptions | undefined) => {
	const output = options?.output;
	if (output !== undefined && output !== "linear" && output !== "perceptual-scale") {
		throw new Error(`output is "${String(output)}": use "linear" or "perceptual-scale".`);
	}
	const outputType = options?.outputType;
	if (
		outputType !== undefined &&
		!["font-weight", "scale", "translate", "rotate", "transform-origin"].includes(outputType)
	) {
		throw new Error(
			`outputType is "${String(outputType)}": use "font-weight", "scale", "translate", "rotate" or "transform-origin".`,
		);
	}
};

/** Resolves an output range into the plan that evaluates it. */
const planFor = (
	outputRange: readonly unknown[],
	options: InterpolateOptions | undefined,
): OutputPlan<InterpolateOutputValue> => {
	const perceptual = options?.output === "perceptual-scale";
	const outputType = options?.outputType;

	if (outputRange.some((v) => typeof v === "boolean")) {
		if (!outputRange.every((v) => typeof v === "boolean")) {
			throw new TypeError(
				"outputRange mixes booleans with other values: a range with booleans must hold only booleans.",
			);
		}
		if (outputType !== undefined) {
			throw new TypeError(
				`outputType "${outputType}" does not apply to an outputRange of booleans: remove it.`,
			);
		}
		return discretePlan(outputRange as boolean[], options, "booleans");
	}

	if (outputType === "font-weight") {
		if (!outputRange.every((v) => typeof v === "number" || typeof v === "string")) {
			throw new TypeError(
				'With outputType "font-weight", outputRange must hold only numbers and strings.',
			);
		}
		const weights = (outputRange as (number | string)[]).map((v) => [parseFontWeight(v)]);
		return vectorPlan(weights, (c) => c[0] as number, perceptual);
	}

	const hasString = outputRange.some((v) => typeof v === "string");
	if (outputRange.some(Array.isArray)) {
		if (!outputRange.every(Array.isArray)) {
			throw new TypeError(hasString ? UNSUPPORTED_WITH_STRINGS : UNSUPPORTED);
		}
		const tuples = outputRange as readonly (readonly unknown[])[];
		const size = (tuples[0] as readonly unknown[]).length;
		for (const tuple of tuples) {
			if (tuple.length !== size) {
				throw new TypeError(
					`outputRange tuples have different lengths (${size} and ${tuple.length}): give every keyframe the same number of values.`,
				);
			}
		}
		for (const tuple of tuples) {
			if (!tuple.every((v) => typeof v === "number" && Number.isFinite(v))) {
				throw new TypeError(
					`outputRange tuple ${formatRange(tuple as number[])} holds a value that is not a finite number: use finite numbers only.`,
				);
			}
		}
		if (size === 0) {
			throw new TypeError("outputRange tuples are empty: each one needs at least one number.");
		}
		if (needsCssUnits(outputType)) {
			throw new TypeError(cssUnitsNeeded(outputType));
		}
		return vectorPlan(tuples as readonly (readonly number[])[], (c) => [...c], perceptual);
	}

	if (!outputRange.every((v) => typeof v === "number" || typeof v === "string")) {
		throw new TypeError(hasString ? UNSUPPORTED_WITH_STRINGS : UNSUPPORTED);
	}
	const numbers = outputRange.filter((v): v is number => typeof v === "number");
	if (!numbers.every(Number.isFinite)) {
		throw new Error(
			`outputRange ${formatRange(numbers)} holds a value that is not a finite number: every output value must be finite.`,
		);
	}
	if (!hasString) {
		if (needsCssUnits(outputType)) {
			throw new TypeError(cssUnitsNeeded(outputType));
		}
		return vectorPlan(
			numbers.map((n) => [n]),
			(c) => c[0] as number,
			perceptual,
		);
	}

	const values = outputRange as readonly (string | number)[];
	const notCss = values.find(
		(v): v is string => typeof v === "string" && !looksLikeCssValue(v, outputType),
	);
	if (notCss !== undefined) {
		if (values.every((v) => typeof v === "string")) {
			return discretePlan(values as string[], options, "non-numeric strings");
		}
		throw new UnsupportedStringInterpolationValueError(notCss);
	}
	const css: CssPlan = planCssOutput(
		values,
		outputType as Exclude<InterpolateOutputType, "font-weight"> | undefined,
	);
	return { ...css, perceptual };
};

/**
 * Maps `input` from `inputRange` to `outputRange`, piecewise between
 * keyframes, with optional easing per segment and a choice of extrapolation on
 * each side. Compatible with Remotion's `interpolate()`.
 *
 * The output range can hold numbers, numeric tuples (interpolated element by
 * element), CSS `scale`, `translate`, `rotate` and `transform-origin` strings
 * (interpolated per component, output rounded to 6 decimals), font weights
 * with `outputType: "font-weight"`, and discrete strings or booleans, which
 * need `easing: Easing.step1` and hold each keyframe's value until the next.
 *
 * `inputRange` must be strictly increasing, both ranges must have the same
 * non-zero length and contain only finite numbers. With a single keyframe the
 * only output value is returned as it is. Invalid arguments throw an `Error`
 * or `TypeError` where Remotion does.
 *
 * @example interpolate(10, [0, 20], [0, 1]) // 0.5
 * @example interpolate(15, [0, 30], ["0px 0px", "0px -150px"]) // "0px -75px"
 */
export function interpolate(
	input: number,
	inputRange: readonly number[],
	outputRange: readonly (number | string)[],
	options: InterpolateOptions & { outputType: "font-weight" },
): number;
export function interpolate(
	input: number,
	inputRange: readonly number[],
	outputRange: readonly number[],
	options?: InterpolateOptions,
): number;
export function interpolate<T extends readonly number[]>(
	input: number,
	inputRange: readonly number[],
	outputRange: readonly T[],
	options?: InterpolateOptions,
): T;
export function interpolate(
	input: number,
	inputRange: readonly number[],
	outputRange: readonly (string | number)[],
	options?: InterpolateOptions,
): string;
export function interpolate(
	input: number,
	inputRange: readonly number[],
	outputRange: readonly boolean[],
	options?: InterpolateOptions,
): boolean;
export function interpolate(
	input: number,
	inputRange: readonly number[],
	outputRange: readonly InterpolateOutputValue[],
	options?: InterpolateOptions,
): InterpolateOutputValue {
	if (typeof input === "undefined") {
		throw new Error("input is undefined: pass the number to map, such as the current frame.");
	}
	if (typeof input !== "number") {
		throw new TypeError(
			`input is ${input === null ? "null" : `a ${typeof input}`}, not a number: pass the number to map, such as the current frame.`,
		);
	}
	if (inputRange.length !== outputRange.length) {
		throw new Error(
			`inputRange has ${inputRange.length} values and outputRange ${outputRange.length}: give both one value per keyframe.`,
		);
	}
	validateInputRange(inputRange);
	const easingFor = resolveEasings(options?.easing, inputRange.length - 1);
	const posterize = resolvePosterize(options?.posterize);
	validateOptions(options);
	const plan = planFor(outputRange, options);

	// A single keyframe is the output, normalised like any keyframe (a CSS
	// string comes back formatted, "left" as "0% 50%").
	if (inputRange.length === 1) return plan.format(plan.keyframe(0));
	return evaluate(input, inputRange, plan, options, easingFor, posterize);
}
