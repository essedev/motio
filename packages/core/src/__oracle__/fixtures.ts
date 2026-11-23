// Helpers shared by the oracle tests. The JSON files next to this module are
// recorded from the published Remotion package by tools/oracle (pnpm record).

import { compareFailure, failureOf, type RecordedFailure } from "@motiojs/testing/oracle-errors";
import { expect } from "vitest";
import { Easing, type EasingFunction } from "../easing.js";
import type { InterpolateOptions } from "../interpolate.js";

/** Fixtures store NaN, +-Infinity and -0 as strings that Number() parses back. */
export type Encoded = number | string;

export const decode = (value: Encoded): number =>
	typeof value === "string" ? Number(value) : value;

export const decodeAll = (values: readonly Encoded[]): number[] => values.map(decode);

/** Easing specs as written by tools/oracle/record.mjs. */
export type EasingSpec = string | [string, ...(number | EasingSpec | Record<string, unknown>)[]];

export const buildEasing = (spec: EasingSpec): EasingFunction => {
	if (Array.isArray(spec) && spec[0] === "spring") {
		return Easing.spring(untag(spec[1]) as Parameters<typeof Easing.spring>[0]);
	}
	if (Array.isArray(spec) && spec[0] === "tail") {
		const inner = buildEasing(spec[1] as EasingSpec);
		return Object.assign((t: number) => inner(t), { remotionShouldExtendRight: true });
	}
	if (typeof spec === "string") {
		const fn = (Easing as unknown as Record<string, unknown>)[spec];
		if (typeof fn !== "function") throw new Error(`unknown easing ${spec}`);
		return fn as EasingFunction;
	}
	const [name, ...args] = spec;
	if (name === "in" || name === "out" || name === "inOut") {
		return Easing[name](buildEasing(args[0] as EasingSpec));
	}
	const numbers = args.map((a) => decode(a as Encoded));
	switch (name) {
		case "poly":
			return Easing.poly(numbers[0] as number);
		case "elastic":
			return numbers.length === 0 ? Easing.elastic() : Easing.elastic(numbers[0]);
		case "back":
			return numbers.length === 0 ? Easing.back() : Easing.back(numbers[0]);
		case "bezier": {
			const [x1, y1, x2, y2] = numbers as [number, number, number, number];
			return Easing.bezier(x1, y1, x2, y2);
		}
		default:
			throw new Error(`unknown easing factory ${name}`);
	}
};

/**
 * Error of `actual` against `expected`: relative for |expected| >= 1,
 * absolute below (so values near zero are not held to an impossible bound).
 * Identical values, including two NaNs and equal infinities, have error 0.
 */
export const errorOf = (actual: number, expected: number): number => {
	if (Object.is(actual, expected) || actual === expected) return 0;
	if (Number.isNaN(actual) || Number.isNaN(expected)) return Number.POSITIVE_INFINITY;
	return Math.abs(actual - expected) / Math.max(1, Math.abs(expected));
};

/** Tracks the worst error over many comparisons, for one readable assertion. */
export class ErrorTracker {
	max = 0;
	worst = "";
	count = 0;

	add(actual: number, expected: number, context: () => string): void {
		this.count++;
		const error = errorOf(actual, expected);
		if (error > this.max || (Number.isNaN(error) && !Number.isNaN(this.max))) {
			this.max = error;
			this.worst = `${context()}: got ${actual}, expected ${expected}`;
		}
	}
}

/**
 * Values of the fixtures that hold strings (interpolate-outputs, easing-spring,
 * interactive): NaN, infinities and -0 are written { "$n": "NaN" } and
 * undefined { "$u": true }.
 */
export const untag = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(untag);
	if (value !== null && typeof value === "object") {
		if ("$n" in value) return Number((value as { $n: string }).$n);
		if ("$u" in value) return undefined;
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, untag(v)]));
	}
	return value;
};

/** Options as stored in the fixtures: easings are specs, not functions. */
export type FixtureOptions = {
	extrapolateLeft?: string;
	extrapolateRight?: string;
	easing?: EasingSpec;
	easingSegments?: EasingSpec[];
	posterize?: Encoded;
	output?: string;
	outputType?: string;
};

/** Builds real options from fixture options. */
export const toOptions = (o: FixtureOptions): InterpolateOptions => {
	const options: Record<string, unknown> = {};
	if (o.extrapolateLeft !== undefined) options.extrapolateLeft = o.extrapolateLeft;
	if (o.extrapolateRight !== undefined) options.extrapolateRight = o.extrapolateRight;
	if (o.posterize !== undefined) options.posterize = decode(o.posterize);
	if (o.output !== undefined) options.output = o.output;
	if (o.outputType !== undefined) options.outputType = o.outputType;
	if (o.easing !== undefined) options.easing = buildEasing(o.easing);
	if (o.easingSegments !== undefined) options.easing = o.easingSegments.map(buildEasing);
	return options as InterpolateOptions;
};

/**
 * Arguments and options of `interpolate()`, `interpolateColors()`, `spring()`, `measureSpring()`
 * and `Easing`: when a recorded message names one of them, Motio's message must name it too.
 */
export const OPTION_NAMES = [
	"input",
	"inputRange",
	"outputRange",
	"easing",
	"posterize",
	"output",
	"outputType",
	"extrapolateLeft",
	"extrapolateRight",
	"Easing.step1",
	"fps",
	"frame",
	"damping",
	"stiffness",
	"threshold",
	"durationInFrames",
];

/**
 * Asserts that `call` fails like the recorded call: it throws, with the same built-in error class,
 * a message of Motio's own that names the same options (see `compareFailure`).
 */
export const expectSameFailure = (
	call: () => unknown,
	recorded: RecordedFailure,
	context: string,
): void => {
	const { threw, error } = failureOf(call);
	expect(threw, `${context}: should throw`).toBe(true);
	expect(compareFailure(error, recorded, OPTION_NAMES), context).toBeUndefined();
};
