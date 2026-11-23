import { describe, expect, it } from "vitest";
import fixture from "./__oracle__/exports.json" with { type: "json" };
import { expectSameFailure, untag } from "./__oracle__/fixtures.js";
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

/** Asserts that `call` returns, or fails like the recorded call (same class, same options named). */
const expectOutcome = (call: () => void, c: Outcome, label: string) => {
	if (c.error === undefined) expect(call, label).not.toThrow();
	else expectSameFailure(call, { error: c.error, errorType: c.errorType }, label);
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
			expectOutcome(
				() => assertValidInterpolateEasingOption(build(c.easing), build(c.length) as number),
				c,
				JSON.stringify([c.easing, c.length]),
			);
		}
	});

	const posterizeCases = recorded("assertValidInterpolatePosterizeOption") as Array<
		Outcome & { posterize: unknown }
	>;
	it(`assertValidInterpolatePosterizeOption over ${posterizeCases.length} cases`, () => {
		for (const c of posterizeCases) {
			expectOutcome(
				() => assertValidInterpolatePosterizeOption(build(c.posterize)),
				c,
				JSON.stringify(c.posterize),
			);
		}
	});

	it("interpolate() rejects easing arrays holding non-functions, like Remotion", () => {
		const easing = [(t: number) => t, 2] as unknown as Array<(t: number) => number>;
		expect(() => interpolate(0.5, [0, 1, 2], [0, 1, 2], { easing })).toThrow(
			"easing[1] is a number, not a function",
		);
	});
});
