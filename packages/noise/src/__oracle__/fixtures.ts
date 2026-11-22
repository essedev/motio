// Helpers shared by the oracle tests. The JSON files next to this module are
// recorded from the published Remotion package by tools/oracle-features
// (pnpm record).

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
