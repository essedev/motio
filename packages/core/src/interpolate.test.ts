import { describe, expect, it } from "vitest";
import {
	decode,
	decodeAll,
	type Encoded,
	ErrorTracker,
	expectSameFailure,
	type FixtureOptions,
	toOptions,
} from "./__oracle__/fixtures.js";
import fixture from "./__oracle__/interpolate.json" with { type: "json" };
import errorFixture from "./__oracle__/interpolate-errors.json" with { type: "json" };
import { Easing } from "./easing.js";
import { type InterpolateOptions, interpolate } from "./interpolate.js";

type GridCase = {
	inputRange: Encoded[];
	outputRange: Encoded[];
	options: FixtureOptions;
	inputs: Encoded[];
	out: Encoded[];
};

type ErrorCase = {
	input: Encoded | null;
	inputType: string;
	inputRange: Encoded[];
	outputRange: Encoded[];
	options: FixtureOptions;
	out?: Encoded;
	error?: string;
	errorType?: string;
};

// Tolerance: 1e-12 (relative above 1, absolute below). 99% of the values
// are bit-identical; the worst measured difference is 1e-15, inherited from
// a bezier easing.
const TOLERANCE = 1e-12;

describe("interpolate against the Remotion oracle", () => {
	it(`matches every grid value within ${TOLERANCE}`, () => {
		const tracker = new ErrorTracker();
		for (const c of fixture.cases as GridCase[]) {
			const inputRange = decodeAll(c.inputRange);
			const outputRange = decodeAll(c.outputRange);
			const options = toOptions(c.options);
			decodeAll(c.inputs).forEach((x, i) => {
				tracker.add(
					interpolate(x, inputRange, outputRange, options),
					decode(c.out[i] as Encoded),
					() =>
						`interpolate(${x}, ${JSON.stringify(c.inputRange)}, ${JSON.stringify(c.outputRange)}, ${JSON.stringify(c.options)})`,
				);
			});
		}
		expect(tracker.count).toBeGreaterThan(30_000);
		expect(tracker.max, tracker.worst).toBeLessThanOrEqual(TOLERANCE);
	});

	it("throws for the same invalid arguments, with the same error class", () => {
		for (const c of errorFixture.cases as ErrorCase[]) {
			const input = c.inputType === "undefined" ? undefined : c.input;
			const call = () =>
				interpolate(
					(typeof input === "string" && c.inputType === "number" ? decode(input) : input) as number,
					decodeAll(c.inputRange),
					decodeAll(c.outputRange),
					toOptions(c.options),
				);
			if (c.error !== undefined) {
				expectSameFailure(call, { error: c.error, errorType: c.errorType }, JSON.stringify(c));
			} else {
				expect(call()).toBe(decode(c.out as Encoded));
			}
		}
	});
});

describe("interpolate", () => {
	it("maps linearly inside the range", () => {
		expect(interpolate(10, [0, 20], [0, 1])).toBe(0.5);
	});

	it("applies each documented extrapolation mode", () => {
		const at = (extrapolateRight: InterpolateOptions["extrapolateRight"]) =>
			interpolate(1.5, [0, 1], [0, 2], { extrapolateRight });
		expect(at("extend")).toBe(3);
		expect(at("clamp")).toBe(2);
		expect(at("identity")).toBe(1.5);
		expect(at("wrap")).toBe(1);
	});

	it("wraps over the whole input range with several keyframes", () => {
		expect(interpolate(35, [0, 10, 30], [0, 100, 200], { extrapolateRight: "wrap" })).toBe(50);
	});

	it("uses one easing per segment when given an array", () => {
		const options = { easing: [Easing.quad, Easing.linear] };
		expect(interpolate(5, [0, 10, 20], [0, 10, 20], options)).toBe(2.5);
		expect(interpolate(15, [0, 10, 20], [0, 10, 20], options)).toBe(15);
	});

	it("quantises the input with posterize", () => {
		expect(interpolate(2, [0, 60], [0, 60], { posterize: 3 })).toBe(0);
		expect(interpolate(4, [0, 60], [0, 60], { posterize: 3 })).toBe(3);
	});

	it("rejects ranges that are not strictly increasing", () => {
		expect(() => interpolate(1, [0, 1, 1], [0, 1, 2])).toThrow(
			"inputRange [0,1,1] is not strictly increasing",
		);
	});
});
