import { describe, expect, it } from "vitest";
import fixture from "./__oracle__/easing.json" with { type: "json" };
import {
	buildEasing,
	decode,
	decodeAll,
	type EasingSpec,
	type Encoded,
	ErrorTracker,
} from "./__oracle__/fixtures.js";
import { Easing } from "./easing.js";

type EasingCase =
	| { easing: EasingSpec; t: Encoded[]; out: Encoded[] }
	| { easing: EasingSpec; error: string };

const cases = fixture.cases as EasingCase[];

// Tolerance: 1e-12 (relative above 1, absolute below). The curves are the
// same closed forms and the bezier solver uses the same iteration scheme;
// the worst measured difference is 1.4e-14, from operation order.
const TOLERANCE = 1e-12;

describe("Easing against the Remotion oracle", () => {
	it(`matches every sampled curve within ${TOLERANCE}`, () => {
		const tracker = new ErrorTracker();
		for (const c of cases) {
			if (!("out" in c)) continue;
			const fn = buildEasing(c.easing);
			const ts = decodeAll(c.t);
			ts.forEach((t, i) => {
				tracker.add(fn(t), decode(c.out[i] as Encoded), () => `${JSON.stringify(c.easing)}(${t})`);
			});
		}
		expect(tracker.count).toBeGreaterThan(15_000);
		expect(tracker.max, tracker.worst).toBeLessThanOrEqual(TOLERANCE);
	});

	it("throws the same errors for invalid bezier control points", () => {
		const errorCases = cases.filter((c) => "error" in c);
		expect(errorCases.length).toBeGreaterThan(0);
		for (const c of errorCases) {
			expect(() => buildEasing(c.easing)(0.5)).toThrow(c.error);
		}
	});
});

describe("Easing", () => {
	it("keeps the end points of every curve", () => {
		for (const fn of [Easing.linear, Easing.ease, Easing.quad, Easing.cubic, Easing.sin]) {
			expect(fn(0)).toBeCloseTo(0, 12);
			expect(fn(1)).toBeCloseTo(1, 12);
		}
	});

	it("builds out and inOut from the base curve", () => {
		expect(Easing.out(Easing.quad)(0.25)).toBeCloseTo(1 - 0.75 * 0.75, 12);
		expect(Easing.inOut(Easing.quad)(0.25)).toBeCloseTo(0.125, 12);
		expect(Easing.inOut(Easing.quad)(0.75)).toBeCloseTo(0.875, 12);
	});

	it("treats a bezier on the diagonal as linear", () => {
		expect(Easing.bezier(0.3, 0.3, 0.7, 0.7)(0.123)).toBe(0.123);
	});
});
