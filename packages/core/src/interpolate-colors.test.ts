import { describe, expect, it } from "vitest";
import {
	decode,
	decodeAll,
	type Encoded,
	expectSameFailure,
	type FixtureOptions,
	toOptions,
} from "./__oracle__/fixtures.js";
import fixture from "./__oracle__/interpolate-colors.json" with { type: "json" };
import edgeFixture from "./__oracle__/interpolate-colors-edge.json" with { type: "json" };
import parseFixture from "./__oracle__/interpolate-colors-parse.json" with { type: "json" };
import { Easing } from "./easing.js";
import { interpolateColors } from "./interpolate-colors.js";
import { parseColor } from "./parse-color.js";

type GridCase = {
	inputRange: Encoded[];
	outputRange: string[];
	options: FixtureOptions;
	inputs: Encoded[];
	out?: string[];
	error?: string;
	errorType?: string;
};

type EdgeCase = {
	input: Encoded | null;
	inputType: string;
	inputRange: Encoded[];
	outputRange: unknown[];
	options: FixtureOptions;
	out?: string;
	error?: string;
	errorType?: string;
};

type ParseCase = { probe: string; out?: string; error?: string; errorType?: string };

/** The result as a string, or the thrown message prefixed with "Error: ". */
const outcome = (fn: () => string) => {
	try {
		return fn();
	} catch (e) {
		return `Error: ${(e as Error).message}`;
	}
};

// Tolerance: none. The output is a string of rounded channels, and every
// recorded string must be identical.
describe("interpolateColors against the Remotion oracle", () => {
	it("returns identical strings over every grid", () => {
		const mismatches: string[] = [];
		let count = 0;
		for (const c of fixture.cases as GridCase[]) {
			const inputRange = decodeAll(c.inputRange);
			const options = toOptions(c.options);
			if (c.error !== undefined) {
				expectSameFailure(
					() => interpolateColors(0.5, inputRange, c.outputRange, options),
					{ error: c.error, errorType: c.errorType },
					JSON.stringify(c.outputRange),
				);
				continue;
			}
			decodeAll(c.inputs).forEach((x, i) => {
				count++;
				const got = outcome(() => interpolateColors(x, inputRange, c.outputRange, options));
				if (got !== c.out?.[i]) {
					mismatches.push(
						`${JSON.stringify([x, c.inputRange, c.outputRange])}: ${got} != ${c.out?.[i]}`,
					);
				}
			});
		}
		expect(count).toBeGreaterThan(3500);
		expect(mismatches.slice(0, 10)).toEqual([]);
	});

	it("matches validation errors and edge cases", () => {
		for (const c of edgeFixture.cases as EdgeCase[]) {
			const input =
				c.inputType === "undefined"
					? undefined
					: c.inputType === "number"
						? decode(c.input as Encoded)
						: c.input;
			const call = () =>
				interpolateColors(
					input as number,
					decodeAll(c.inputRange),
					c.outputRange as string[],
					toOptions(c.options),
				);
			if (c.error !== undefined) {
				expectSameFailure(call, { error: c.error, errorType: c.errorType }, JSON.stringify(c));
			} else {
				expect(call(), JSON.stringify(c)).toBe(c.out);
			}
		}
	});

	it("accepts and rejects the same color strings", () => {
		for (const c of parseFixture.cases as ParseCase[]) {
			const call = () => interpolateColors(0.5, [0, 1], [c.probe, "black"]);
			if (c.error !== undefined) {
				expectSameFailure(call, { error: c.error, errorType: c.errorType }, c.probe);
			} else {
				expect(call(), c.probe).toBe(c.out);
			}
		}
	});
});

describe("interpolateColors", () => {
	it("returns the documented example", () => {
		expect(interpolateColors(10, [0, 20], ["red", "yellow"])).toBe("rgba(255, 128, 0, 1)");
		expect(interpolateColors(10, [0, 20], ["rgba(255, 0, 0, 1)", "rgba(255, 255, 0, 0)"])).toBe(
			"rgba(255, 128, 0, 0.5)",
		);
	});

	it("clamps outside the input range", () => {
		expect(interpolateColors(-5, [0, 1], ["red", "blue"])).toBe("rgba(255, 0, 0, 1)");
		expect(interpolateColors(5, [0, 1], ["red", "blue"])).toBe("rgba(0, 0, 255, 1)");
	});

	it("applies easing to the progress", () => {
		expect(interpolateColors(0.5, [0, 1], ["black", "white"], { easing: Easing.quad })).toBe(
			"rgba(64, 64, 64, 1)",
		);
	});

	it("returns the only color of a single-color range", () => {
		expect(interpolateColors(42, [5], ["#0f08"])).toBe("rgba(0, 255, 0, 0.533)");
	});
});

describe("parseColor", () => {
	it("parses every hex length", () => {
		expect(parseColor("#abc")).toEqual([0xaa, 0xbb, 0xcc, 255]);
		expect(parseColor("#abcd")).toEqual([0xaa, 0xbb, 0xcc, 0xdd]);
		expect(parseColor("#A1B2C3")).toEqual([0xa1, 0xb2, 0xc3, 255]);
		expect(parseColor("#a1b2c3d4")).toEqual([0xa1, 0xb2, 0xc3, 0xd4]);
	});

	it("parses legacy and modern functions", () => {
		expect(parseColor("rgba(300, -1, 12.5, 0.5)")).toEqual([255, 0, 13, 128]);
		expect(parseColor("hsl(120, 100%, 50%)")).toEqual([0, 255, 0, 255]);
		expect(parseColor("hwb(0 0% 0%)")).toEqual([255, 0, 0, 255]);
		expect(parseColor("oklch(1 0 0)")).toEqual([255, 255, 255, 255]);
		expect(parseColor("transparent")).toEqual([0, 0, 0, 0]);
	});

	it("rejects names in the wrong case and non-strings", () => {
		expect(() => parseColor("RED")).toThrow('"RED" is not a supported color');
		expect(() => parseColor(12)).toThrow('"12" is not a supported color');
	});
});
