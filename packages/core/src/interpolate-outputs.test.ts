import { describe, expect, it } from "vitest";
import {
	ErrorTracker,
	errorOf,
	type FixtureOptions,
	toOptions,
	untag,
} from "./__oracle__/fixtures.js";
import fixture from "./__oracle__/interpolate-outputs.json" with { type: "json" };
import errorFixture from "./__oracle__/interpolate-outputs-errors.json" with { type: "json" };
import { Easing } from "./easing.js";
import { interpolate } from "./interpolate.js";

type Result = { out?: unknown; error?: string; errorType?: string };

type GridCase = {
	inputRange: number[];
	outputRange: unknown[];
	options: FixtureOptions;
	inputs: number[];
	results: Result[];
};

type ErrorCase = {
	input: unknown;
	inputRange: number[];
	outputRange: unknown[];
	options: FixtureOptions;
} & Result;

// Strings and booleans must be identical. Numbers (alone, in tuples or font
// weights) are held to 1e-12, relative above 1 and absolute below, like the
// numeric interpolate() fixture.
const TOLERANCE = 1e-12;

const run = (fn: () => unknown): Result => {
	try {
		return { out: fn() };
	} catch (e) {
		const error = e as Error;
		return { error: error.message, errorType: error instanceof TypeError ? "TypeError" : "Error" };
	}
};

/** Compares one result with the recorded one; returns a description of the difference or null. */
const compare = (actual: Result, expected: Result): string | null => {
	if (expected.error !== undefined) {
		if (actual.error === expected.error && actual.errorType === expected.errorType) return null;
		return `expected ${expected.errorType}: ${expected.error}, got ${actual.error !== undefined ? `${actual.errorType}: ${actual.error}` : JSON.stringify(actual.out)}`;
	}
	if (actual.error !== undefined)
		return `expected ${JSON.stringify(expected.out)}, got ${actual.errorType}: ${actual.error}`;
	const a = actual.out;
	const b = expected.out;
	const same =
		typeof b === "number"
			? typeof a === "number" && errorOf(a, b) <= TOLERANCE
			: Array.isArray(b)
				? Array.isArray(a) &&
					a.length === b.length &&
					b.every((v, i) => errorOf(a[i] as number, v as number) <= TOLERANCE)
				: a === b;
	return same ? null : `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`;
};

describe("interpolate with non-numeric outputs against the Remotion oracle", () => {
	it("matches every grid value: strings exactly, numbers within 1e-12", () => {
		const mismatches: string[] = [];
		const numbers = new ErrorTracker();
		let count = 0;
		for (const raw of fixture.cases) {
			const c = untag(raw) as GridCase;
			const options = toOptions(c.options);
			c.inputs.forEach((x, i) => {
				count++;
				const actual = run(() => interpolate(x, c.inputRange, c.outputRange as string[], options));
				const expected = c.results[i] as Result;
				const diff = compare(actual, expected);
				const context = () =>
					`interpolate(${x}, ${JSON.stringify(c.outputRange)}, ${JSON.stringify(c.options)})`;
				if (diff === null && typeof expected.out === "number") {
					numbers.add(actual.out as number, expected.out, context);
				} else if (diff === null && Array.isArray(expected.out)) {
					expected.out.forEach((v, k) => {
						numbers.add((actual.out as number[])[k] as number, v as number, context);
					});
				}
				if (diff !== null) {
					mismatches.push(
						`interpolate(${x}, ${JSON.stringify(c.inputRange)}, ${JSON.stringify(c.outputRange)}, ${JSON.stringify(c.options)}): ${diff}`,
					);
				}
			});
		}
		expect(count).toBeGreaterThan(30_000);
		expect(numbers.count).toBeGreaterThan(9_000);
		expect(numbers.max, numbers.worst).toBeLessThanOrEqual(TOLERANCE);
		expect(mismatches.slice(0, 20), `${mismatches.length} mismatches`).toEqual([]);
	});

	it("throws the same messages and error types for invalid arguments", () => {
		const mismatches: string[] = [];
		for (const raw of errorFixture.cases) {
			const c = untag(raw) as ErrorCase;
			const actual = run(() =>
				interpolate(
					c.input as number,
					c.inputRange,
					c.outputRange as string[],
					toOptions(c.options),
				),
			);
			const diff = compare(actual, c);
			if (diff !== null) {
				mismatches.push(
					`interpolate(${JSON.stringify(c.input)}, ${JSON.stringify(c.inputRange)}, ${JSON.stringify(c.outputRange)}, ${JSON.stringify(c.options)}): ${diff}`,
				);
			}
		}
		expect(mismatches).toEqual([]);
	});
});

describe("interpolate with non-numeric outputs", () => {
	it("interpolates the documented CSS transform examples", () => {
		expect(interpolate(0.5, [0, 1], ["1", "2 3"])).toBe("1.5 2");
		expect(interpolate(0.5, [0, 1], ["0px 0px", "100px 50px"])).toBe("50px 25px");
		expect(interpolate(0.5, [0, 1], ["0deg", "90deg"], { outputType: "rotate" })).toBe("45deg");
		expect(interpolate(0.5, [0, 1], ["left top", "right bottom"])).toBe("50% 50%");
	});

	it("holds discrete strings and booleans until the next keyframe with Easing.step1", () => {
		const easing = Easing.step1;
		expect(interpolate(0.99, [0, 1], ["default", "ne-resize"], { easing })).toBe("default");
		expect(interpolate(1, [0, 1], ["default", "ne-resize"], { easing })).toBe("ne-resize");
		expect(interpolate(59, [0, 60], [false, true], { easing })).toBe(false);
		expect(() => interpolate(0.5, [0, 1], [false, true])).toThrow(TypeError);
	});

	it("interpolates numeric tuples element by element", () => {
		const start = interpolate(0.5, [0, 1], [
			[0, 0.5],
			[1, 0.5],
		] as const);
		expect(start).toEqual([0.5, 0.5]);
	});

	it("distributes scale perceptually with output: perceptual-scale", () => {
		expect(interpolate(0.5, [0, 1], [0, 1], { output: "perceptual-scale" })).toBe(Math.sqrt(0.5));
		expect(interpolate(0.5, [0, 1], [1, 2], { output: "perceptual-scale" })).toBe(Math.sqrt(2.5));
		expect(interpolate(0.5, [0, 1], [0, -1], { output: "perceptual-scale" })).toBe(-Math.sqrt(0.5));
	});

	it("reads font weight keywords only with outputType: font-weight", () => {
		expect(interpolate(0.5, [0, 1], ["normal", "bold"], { outputType: "font-weight" })).toBe(550);
		expect(() => interpolate(0.5, [0, 1], ["normal", "bold"])).toThrow(TypeError);
	});

	it("keeps adding a segment's remaining motion when its easing allows a tail", () => {
		const tail = Easing.spring({ allowTail: true, damping: 200, durationRestThreshold: 0.03 });
		const plain = Easing.spring({ damping: 200, durationRestThreshold: 0.03 });
		const withTail = interpolate(45, [0, 30, 60], [0, 100, 0], { easing: [tail, tail] });
		const without = interpolate(45, [0, 30, 60], [0, 100, 0], { easing: [plain, plain] });
		expect(withTail).toBeCloseTo(100 * tail(1.5) - 100 * tail(0.5), 12);
		expect(withTail).not.toBe(without);
	});
});
