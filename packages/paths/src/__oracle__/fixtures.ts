// Helpers shared by the oracle tests. The JSON files next to this module are
// recorded from the published Remotion package by tools/oracle-features
// (pnpm record).

import { compareFailure, errorClassOf } from "@motiojs/testing/oracle-errors";

/** Fixtures store NaN, +-Infinity and -0 as strings that Number() parses back. */
export type Encoded = number | string;

export const decode = (value: Encoded): number =>
	typeof value === "string" ? Number(value) : value;

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
		if (error > this.max) {
			this.max = error;
			this.worst = `${context()}: got ${actual}, expected ${expected}`;
		}
	}
}

/** A recorded call: either its return value or the message it threw and the error's class. */
export type Outcome<T> =
	| { out: T; error?: undefined }
	| { error: string; errorType?: string | undefined; out?: undefined };

// What Motio threw, kept off the outcome's own keys so it prints and compares like a recording.
const thrown = new WeakMap<object, unknown>();

/** Runs fn and returns its outcome in the shape the fixtures use. */
export const outcomeOf = <T>(fn: () => T): Outcome<T> => {
	try {
		return { out: fn() };
	} catch (e) {
		const outcome = {
			error: e instanceof Error ? e.message : String(e),
			errorType: errorClassOf(e),
		};
		thrown.set(outcome, e);
		return outcome;
	}
};

/** Arguments and options that a failure message should name when the recorded one does. */
const NAMES = [
	"inputRange",
	"outputRange",
	"easing",
	"posterize",
	"currentViewBox",
	"getInstructionIndexAtLength",
];

const isRecordedFailure = (value: unknown): value is { error: string; errorType?: string } =>
	value !== null &&
	typeof value === "object" &&
	!Array.isArray(value) &&
	typeof (value as { error?: unknown }).error === "string";

const NUMERIC_TOKEN = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$|^-?Infinity$|^NaN$/i;

/**
 * Largest error between `actual` and the recorded `expected` value, walking
 * objects and arrays. Numbers use `errorOf`; strings are compared token by
 * token (space separated), numeric tokens with `errorOf`, other tokens
 * exactly. A structural difference is an infinite error.
 */
export const deepError = (actual: unknown, expected: unknown): number => {
	// Failures match on behaviour (same error class, same options named), not on wording.
	if (isRecordedFailure(expected)) {
		if (actual === null || typeof actual !== "object" || !thrown.has(actual)) {
			return Number.POSITIVE_INFINITY;
		}
		return compareFailure(thrown.get(actual), expected, NAMES) === undefined
			? 0
			: Number.POSITIVE_INFINITY;
	}
	if (typeof expected === "string" && typeof actual === "number") {
		return errorOf(actual, Number(expected));
	}
	if (typeof expected === "number" && typeof actual === "number") return errorOf(actual, expected);
	if (typeof expected === "string" && typeof actual === "string") {
		if (actual === expected) return 0;
		const a = actual.split(" ");
		const e = expected.split(" ");
		if (a.length !== e.length) return Number.POSITIVE_INFINITY;
		let max = 0;
		for (let i = 0; i < e.length; i++) {
			const ta = a[i] as string;
			const te = e[i] as string;
			if (ta === te) continue;
			if (!NUMERIC_TOKEN.test(ta) || !NUMERIC_TOKEN.test(te)) return Number.POSITIVE_INFINITY;
			max = Math.max(max, errorOf(Number(ta), Number(te)));
		}
		return max;
	}
	if (Array.isArray(expected)) {
		if (!Array.isArray(actual) || actual.length !== expected.length) {
			return Number.POSITIVE_INFINITY;
		}
		let max = 0;
		expected.forEach((e, i) => {
			max = Math.max(max, deepError(actual[i], e));
		});
		return max;
	}
	if (expected !== null && typeof expected === "object") {
		if (actual === null || typeof actual !== "object") return Number.POSITIVE_INFINITY;
		const keys = Object.keys(expected);
		if (keys.length !== Object.keys(actual).length) return Number.POSITIVE_INFINITY;
		let max = 0;
		for (const key of keys) {
			max = Math.max(
				max,
				deepError(
					(actual as Record<string, unknown>)[key],
					(expected as Record<string, unknown>)[key],
				),
			);
		}
		return max;
	}
	return Object.is(actual, expected) ? 0 : Number.POSITIVE_INFINITY;
};

/** Tracks the worst deep error over many comparisons. */
export class DeepTracker {
	max = 0;
	worst = "";
	count = 0;

	add(actual: unknown, expected: unknown, context: () => string): void {
		this.count++;
		const error = deepError(actual, expected);
		if (error > this.max) {
			this.max = error;
			this.worst = `${context()}: got ${JSON.stringify(actual)?.slice(0, 300)}, expected ${JSON.stringify(expected)?.slice(0, 300)}`;
		}
	}
}
