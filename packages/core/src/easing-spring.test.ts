import { describe, expect, it } from "vitest";
import fixture from "./__oracle__/easing-spring.json" with { type: "json" };
import { ErrorTracker, untag } from "./__oracle__/fixtures.js";
import { Easing } from "./easing.js";
import type { EasingSpringConfig } from "./easing-spring.js";
import { spring } from "./spring.js";

type Result = { out?: number; error?: string; errorType?: string };
type Case = {
	config: EasingSpringConfig | undefined;
	extendRight?: unknown;
	t?: number[];
	results?: Result[];
	error?: string;
	errorType?: string;
};

// Tolerance: 1e-12 (relative above 1, absolute below), as for spring().
const TOLERANCE = 1e-12;

const cases = fixture.cases.map((raw) => untag(raw) as Case);

describe("Easing.spring against the Remotion oracle", () => {
	it(`matches every value within ${TOLERANCE} and throws the same messages`, () => {
		const tracker = new ErrorTracker();
		const mismatches: string[] = [];
		for (const c of cases) {
			if (c.errorType === "timeout" || c.results === undefined || c.t === undefined) continue;
			const easing = Easing.spring(c.config);
			expect(easing.remotionShouldExtendRight, JSON.stringify(c.config)).toBe(c.extendRight);
			c.t.forEach((t, i) => {
				const expected = c.results?.[i] as Result;
				let actual: Result;
				try {
					actual = { out: easing(t) };
				} catch (e) {
					const error = e as Error;
					actual = {
						error: error.message,
						errorType: error instanceof TypeError ? "TypeError" : "Error",
					};
				}
				if (expected.error !== undefined || actual.error !== undefined) {
					if (actual.error !== expected.error || actual.errorType !== expected.errorType) {
						mismatches.push(
							`${JSON.stringify(c.config)} t=${t}: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`,
						);
					}
					return;
				}
				tracker.add(
					actual.out as number,
					expected.out as number,
					() => `Easing.spring(${JSON.stringify(c.config)})(${t})`,
				);
			});
		}
		expect(mismatches).toEqual([]);
		expect(tracker.count).toBeGreaterThan(5000);
		expect(tracker.max, tracker.worst).toBeLessThanOrEqual(TOLERANCE);
	});

	it("throws where Remotion never returns (deliberate difference)", () => {
		const hanging = cases.filter((c) => c.errorType === "timeout").map((c) => c.config);
		expect(hanging).toEqual([{ stiffness: 0 }, { durationRestThreshold: 0 }]);
		expect(() => Easing.spring({ stiffness: 0 })(0.5)).toThrow(
			"Spring stiffness must be greater than 0",
		);
		expect(() => Easing.spring({ durationRestThreshold: 0 })(0.5)).toThrow(
			"durationRestThreshold must be greater than 0",
		);
	});
});

describe("Easing.spring", () => {
	it("is spring() over 30 frames at 30 fps, stretched to its settling time", () => {
		const easing = Easing.spring({ damping: 200 });
		for (const t of [0.1, 0.25, 0.5, 0.9]) {
			const frame = spring({
				frame: t * 30,
				fps: 30,
				config: { damping: 200 },
				durationInFrames: 30,
			});
			expect(easing(t)).toBeCloseTo(frame, 14);
		}
		expect(easing(0)).toBe(0);
		expect(easing(1)).toBe(1);
		expect(easing(2)).toBe(1);
	});

	it("carries on past the end of the segment with allowTail", () => {
		const easing = Easing.spring({ allowTail: true, damping: 200, durationRestThreshold: 0.03 });
		expect(easing.remotionShouldExtendRight).toBe(true);
		expect(easing(1)).toBeLessThan(1);
		expect(easing(2)).toBeGreaterThan(easing(1));
	});

	it("validates the configuration when the spring is first needed, not when created", () => {
		const easing = Easing.spring({ damping: 0 });
		expect(easing(0)).toBe(0);
		expect(easing(1)).toBe(1);
		expect(() => easing(0.5)).toThrow("Spring damping must be greater than 0");
	});
});
