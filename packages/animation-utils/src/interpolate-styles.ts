// interpolateStyles() of @remotion/animation-utils. The docs give the signature and the options
// (those of interpolate()); how CSS values are parsed and combined is reproduced from the
// published package's outputs over the grid in __oracle__/interpolate-styles.json.
import {
	assertValidInterpolateEasingOption,
	assertValidInterpolatePosterizeOption,
	type EasingFunction,
	type InterpolateOptions,
	interpolate,
	interpolateColors,
} from "@motiojs/core";
import { parseColor } from "@motiojs/core/internals";
import type { CSSProperties } from "react";

/** Options of `interpolateStyles()`: those of `interpolate()`. */
export type InterpolateStylesOptions = Pick<
	InterpolateOptions,
	"easing" | "extrapolateLeft" | "extrapolateRight" | "posterize"
>;

type StyleObject = Record<string, unknown>;

/** A whitespace-separated part of a CSS value, with function calls kept whole. */
type Token =
	| { kind: "color"; text: string }
	| { kind: "function"; text: string; name: string; args: string[] }
	/** A number with an optional unit (`10`, `-2.5px`, `50%`). */
	| { kind: "number"; text: string; value: number; unit: string }
	/** Anything else: a keyword, or a number Remotion does not parse (`1e2px`, `.5px`, `+5px`). */
	| { kind: "text"; text: string };

const NUMBER = /^(-?\d+(?:\.\d+)?)([a-zA-Z%]*)$/;
const FUNCTION = /^([a-zA-Z-]+)\(([^)]+)\)$/;

const isColor = (text: string): boolean => {
	try {
		parseColor(text);
		return true;
	} catch {
		// parseColor() throws for anything that is not a color: that is the answer here.
		return false;
	}
};

/**
 * Splits a value into tokens: a function call with a non-empty argument list up to the first
 * `)`, or a run of non-space characters. `f(g(1px))` is `f(g(1px)` and `)`; `a(1)b` is `a(1)`
 * and `b`; `f()` is a plain word.
 */
function split(value: string): string[] {
	return value.match(/[a-zA-Z-]+\([^)]+\)|\S+/g) ?? [];
}

function splitArguments(list: string): string[] {
	const args: string[] = [];
	let depth = 0;
	let current = "";
	for (const char of list) {
		if (char === "(") depth++;
		else if (char === ")") depth--;
		if (char === "," && depth === 0) {
			args.push(current);
			current = "";
		} else {
			current += char;
		}
	}
	args.push(current);
	return args;
}

function numberOrText(text: string): Token {
	const number = NUMBER.exec(text);
	if (number) return { kind: "number", text, value: Number(number[1]), unit: number[2] as string };
	return { kind: "text", text };
}

function classify(text: string): Token {
	if (isColor(text)) return { kind: "color", text };
	const call = FUNCTION.exec(text);
	if (call) {
		// Arguments are split on commas outside parentheses and trimmed; an empty last one is
		// dropped, as Remotion does (`f(1px,)` has one argument, `f(,1px)` two).
		const args = splitArguments(call[2] as string).map((arg) => arg.trim());
		if (args.at(-1) === "") args.pop();
		return { kind: "function", text, name: call[1] as string, args };
	}
	return numberOrText(text);
}

/** The tokens of a whole value: strings are split, `0` is one number, other values have none. */
function tokens(value: unknown): Token[] {
	if (typeof value === "string") return split(value).map(classify);
	if (typeof value === "number") return [numberOrText(String(value))];
	return [];
}

interface Segment {
	input: number;
	range: [number, number];
	options: InterpolateOptions;
	/** The whole start and end values, for error messages. */
	start: string;
	end: string;
}

const sameType = (s: Segment) =>
	new TypeError(
		`The start and end values must be of the same type. Start value: ${s.start}, end value: ${s.end}`,
	);
const nonAnimatable = (s: Segment) =>
	new TypeError(
		`Non-animatable values cannot be interpolated. Start value: ${s.start}, end value: ${s.end}`,
	);

function interpolateNumber(segment: Segment, from: number, to: number): number {
	return interpolate(segment.input, segment.range, [from, to], segment.options);
}

/**
 * A number towards whatever the end token is. Units must match unless one side is zero; the
 * result takes the start's unit, else the end's. An end without a number (a color, a function,
 * a word) counts as 0 with no unit, or with the word as its unit.
 */
function interpolateNumberToken(
	segment: Segment,
	a: { value: number; unit: string },
	b: Token | undefined,
): string {
	if (b === undefined) throw sameType(segment);
	const end =
		b.kind === "number"
			? { value: b.value, unit: b.unit }
			: { value: Number.NaN, unit: b.kind === "text" ? b.text : "" };
	if (a.unit !== end.unit && a.value !== 0 && end.value !== 0) {
		throw new TypeError(
			`The units of the start and end values must match. Start value: ${segment.start}, end value: ${segment.end}`,
		);
	}
	const to = Number.isNaN(end.value) ? 0 : end.value;
	return `${interpolateNumber(segment, a.value, to)}${a.unit || end.unit}`;
}

/** A number or a word, inside a function or on its own. */
function interpolateScalar(segment: Segment, a: Token, b: Token | undefined): string {
	if (a.kind === "number") return interpolateNumberToken(segment, a, b);
	if (b !== undefined && a.text === b.text) return a.text;
	throw nonAnimatable(segment);
}

function interpolateToken(segment: Segment, a: Token, b: Token): string {
	if (a.kind === "number" || a.kind === "text") return interpolateScalar(segment, a, b);
	if (a.kind === "color") {
		if (b.kind !== "color") throw sameType(segment);
		const options: { easing?: EasingFunction; posterize?: number } = {};
		const easing = segment.options.easing;
		if (typeof easing === "function") options.easing = easing;
		if (segment.options.posterize !== undefined) options.posterize = segment.options.posterize;
		return interpolateColors(segment.input, segment.range, [a.text, b.text], options);
	}
	if (b.kind !== "function" || a.name !== b.name) throw sameType(segment);
	// Arguments are taken in order: one the end lacks fails when it is reached.
	const args = a.args.map((arg, i) => {
		const end = b.args[i];
		if (end === undefined) throw sameType(segment);
		return interpolateScalar(segment, numberOrText(arg), numberOrText(end));
	});
	return `${a.name}(${args.join(", ")})`;
}

/** Numeric results come back as numbers (`"1.5"` and `"0.5"` interpolate to `1`). */
const numericOrString = (text: string): number | string => {
	const value = Number(text);
	return Number.isNaN(value) ? text : value;
};

function interpolateValue(segment: Segment, start: unknown, end: unknown): unknown {
	if (end === undefined || end === null) return start;
	// A 0 on either side is taken as the token "0" whatever the other side's type.
	if (typeof start !== typeof end && start !== 0 && end !== 0) throw sameType(segment);
	if (typeof start === "number" && typeof end === "number") {
		const to = Number.isNaN(end) ? 0 : end;
		return numericOrString(String(interpolateNumber(segment, start, to)));
	}
	const from = tokens(start);
	const to = tokens(end);
	if (from.length !== to.length) {
		throw new TypeError(
			`The start and end values must have the same structure. Start value: ${segment.start}, end value: ${segment.end}`,
		);
	}
	return numericOrString(
		from.map((token, i) => interpolateToken(segment, token, to[i] as Token)).join(" "),
	);
}

/**
 * Interpolates between style objects: at `input`, each property of the keyframe at or before it
 * moves towards the same property of the next keyframe, with the options of `interpolate()`
 * (`easing` may hold one function per segment). Numbers, lengths with matching units (a zero
 * takes the other side's unit), colors, transform and filter functions with numeric arguments,
 * and values made of several of these are interpolated; other words must be equal on both
 * sides. A property missing from the next keyframe keeps its value; one missing from the
 * current keyframe is left out.
 */
export function interpolateStyles(
	input: number,
	inputRange: readonly number[],
	outputStylesRange: readonly CSSProperties[],
	options?: InterpolateStylesOptions,
): CSSProperties {
	if (input === undefined) throw new Error("input can not be undefined");
	if (inputRange.length < 2) throw new Error("inputRange must have at least 2 elements");
	if (inputRange.length !== outputStylesRange.length) {
		throw new Error(
			`inputRange (${inputRange.length}) and outputStylesRange (${outputStylesRange.length}) must have the same length`,
		);
	}
	for (let i = 1; i < inputRange.length; i++) {
		if (!((inputRange[i] as number) > (inputRange[i - 1] as number))) {
			throw new Error(
				`inputRange must be strictly monotonically non-decreasing but got [${inputRange.join(",")}]`,
			);
		}
	}
	assertValidInterpolatePosterizeOption(options?.posterize);
	assertValidInterpolateEasingOption(options?.easing, inputRange.length);
	let index = 0;
	while (index < inputRange.length - 2 && input >= (inputRange[index + 1] as number)) index++;
	const easing = options?.easing;
	const segmentOptions: InterpolateOptions = {
		...options,
		easing: Array.isArray(easing) ? (easing as readonly EasingFunction[])[index] : easing,
	};
	const startStyle = outputStylesRange[index] as StyleObject;
	const endStyle = outputStylesRange[index + 1] as StyleObject;
	const result: StyleObject = {};
	for (const [key, start] of Object.entries(startStyle)) {
		const end = endStyle[key];
		result[key] = interpolateValue(
			{
				input,
				range: [inputRange[index] as number, inputRange[index + 1] as number],
				options: segmentOptions,
				start: String(start),
				end: String(end),
			},
			start,
			end,
		);
	}
	return result as CSSProperties;
}
