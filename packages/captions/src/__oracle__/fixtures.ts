// Helpers shared by the oracle tests. The JSON files next to this module are
// recorded from the published Remotion package by tools/oracle-features
// (pnpm record).

import { compareFailure, failureOf } from "@motiojs/testing/oracle-errors";
import { expect } from "vitest";

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
	| { error: string; errorType?: string; out?: undefined };

/**
 * Asserts that `fn` does what the recorded call did: returns a strictly equal value, or fails with
 * the same error class (compareFailure()). A recorded strict SRT error names a cue and a line;
 * Motio's must name the same ones.
 */
export const expectOutcome = <T>(fn: () => T, expected: Outcome<T>, label: string): void => {
	if (expected.error === undefined) {
		expect({ out: fn() }, label).toStrictEqual(expected);
		return;
	}
	const { threw, error } = failureOf(fn);
	expect(threw, `${label}: should throw`).toBe(true);
	expect(compareFailure(error, expected), label).toBeUndefined();
	const where = /cue (\d+), line (\d+)/.exec(expected.error);
	if (where !== null) {
		const message = (error as Error).message;
		expect(message, label).toMatch(new RegExp(`\\bline ${where[2]}\\b`, "i"));
		expect(message, label).toMatch(new RegExp(`\\bcue ${where[1]}\\b`, "i"));
	}
};

const NUMERIC_KEYS = new Set([
	"startMs",
	"endMs",
	"timestampMs",
	"confidence",
	"fromMs",
	"toMs",
	"durationMs",
	"combineTokensWithinMilliseconds",
	"breakOnSilenceAfterMilliseconds",
]);

/** Decodes the encoded numbers of known numeric fields, recursively. */
export const decodeDeep = <T>(value: unknown): T => {
	if (Array.isArray(value)) return value.map((v) => decodeDeep(v)) as T;
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([k, v]) => [
				k,
				NUMERIC_KEYS.has(k) && typeof v === "string" ? Number(v) : decodeDeep(v),
			]),
		) as T;
	}
	return value as T;
};

/** Runs fn and returns its outcome in the shape the fixtures use. */
export const outcomeOf = <T>(fn: () => T): Outcome<T> => {
	try {
		return { out: fn() };
	} catch (e) {
		return { error: e instanceof Error ? e.message : String(e) };
	}
};
