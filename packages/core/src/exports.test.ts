import { describe, expect, it } from "vitest";
import fixture from "./__oracle__/exports.json" with { type: "json" };
import { untag } from "./__oracle__/fixtures.js";
import { absoluteFillSchema } from "./interactive-schema.js";
import {
	assertValidInterpolateEasingOption,
	assertValidInterpolatePosterizeOption,
	interpolate,
} from "./interpolate.js";

type Outcome = { error?: string; errorType?: string };
const recorded = (name: string): unknown =>
	(fixture.cases as Array<{ name: string; value: unknown }>).find((c) => c.name === name)?.value;

// Argument specs written by tools/oracle/record-exports.mjs.
const build = (spec: unknown): unknown => {
	if (Array.isArray(spec)) return spec.map(build);
	if (spec !== null && typeof spec === "object") {
		if ("$fn" in spec) return (t: number) => t;
		if ("$u" in spec) return undefined;
		if ("$n" in spec) return Number((spec as { $n: string }).$n);
		return Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, build(v)]));
	}
	return spec;
};

const outcome = (fn: () => void): Outcome => {
	try {
		fn();
		return {};
	} catch (error) {
		const e = error as Error;
		return { error: e.message, errorType: e instanceof TypeError ? "TypeError" : "Error" };
	}
};

describe("plain-data exports equal the published package", () => {
	it("absoluteFillSchema", () => {
		expect(absoluteFillSchema).toStrictEqual(untag(recorded("absoluteFillSchema")));
	});
});

describe("interpolate() option checks equal the oracle", () => {
	const easingCases = recorded("assertValidInterpolateEasingOption") as Array<
		Outcome & { easing: unknown; length: unknown }
	>;
	it(`assertValidInterpolateEasingOption over ${easingCases.length} cases`, () => {
		for (const c of easingCases) {
			const got = outcome(() =>
				assertValidInterpolateEasingOption(build(c.easing), build(c.length) as number),
			);
			const label = JSON.stringify([c.easing, c.length]);
			expect(got.error, label).toBe(c.error);
			expect(got.errorType, label).toBe(c.errorType);
		}
	});

	const posterizeCases = recorded("assertValidInterpolatePosterizeOption") as Array<
		Outcome & { posterize: unknown }
	>;
	it(`assertValidInterpolatePosterizeOption over ${posterizeCases.length} cases`, () => {
		for (const c of posterizeCases) {
			const got = outcome(() => assertValidInterpolatePosterizeOption(build(c.posterize)));
			expect(got, JSON.stringify(c.posterize)).toEqual(
				c.error === undefined ? {} : { error: c.error, errorType: c.errorType },
			);
		}
	});

	it("interpolate() rejects easing arrays holding non-functions, like Remotion", () => {
		const easing = [(t: number) => t, 2] as unknown as Array<(t: number) => number>;
		expect(() => interpolate(0.5, [0, 1, 2], [0, 1, 2], { easing })).toThrow(
			"easing[1] must be a function",
		);
	});
});
