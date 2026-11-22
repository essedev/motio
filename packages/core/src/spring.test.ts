import { describe, expect, it } from "vitest";
import { decode, decodeAll, type Encoded, ErrorTracker } from "./__oracle__/fixtures.js";
import measureFixture from "./__oracle__/measure-spring.json" with { type: "json" };
import springFixture from "./__oracle__/spring.json" with { type: "json" };
import errorFixture from "./__oracle__/spring-errors.json" with { type: "json" };
import optionsFixture from "./__oracle__/spring-options.json" with { type: "json" };
import { type MeasureSpringOptions, measureSpring, type SpringOptions, spring } from "./spring.js";

type Params = Record<string, Encoded | boolean | Record<string, number | boolean> | undefined>;
type FrameCase = { params: Params; frames: Encoded[]; out: Encoded[] };
type ResultCase = { params: Params; out?: Encoded; error?: string };

const decodeParams = (params: Params): Record<string, unknown> =>
	Object.fromEntries(
		Object.entries(params).map(([k, v]) => [
			k,
			typeof v === "string" || typeof v === "number" ? decode(v) : v,
		]),
	);

// Tolerance: 1e-12 (relative above 1, absolute below). The closed-form
// solution is the same; the worst measured difference is about 6e-15, from
// evaluating the oscillation phase in a different order.
const TOLERANCE = 1e-12;

const compareFrames = (cases: FrameCase[]) => {
	const tracker = new ErrorTracker();
	for (const c of cases) {
		const params = decodeParams(c.params);
		decodeAll(c.frames).forEach((frame, i) => {
			tracker.add(
				spring({ ...params, frame } as SpringOptions),
				decode(c.out[i] as Encoded),
				() => `spring(${JSON.stringify({ ...c.params, frame })})`,
			);
		});
	}
	return tracker;
};

describe("spring against the Remotion oracle", () => {
	it(`matches the physical config grid within ${TOLERANCE}`, () => {
		const tracker = compareFrames(springFixture.cases as FrameCase[]);
		expect(tracker.count).toBeGreaterThan(29_000);
		expect(tracker.max, tracker.worst).toBeLessThanOrEqual(TOLERANCE);
	});

	it(`matches from, to, fps, durationInFrames, delay and reverse within ${TOLERANCE}`, () => {
		const tracker = compareFrames(optionsFixture.cases as FrameCase[]);
		expect(tracker.count).toBeGreaterThan(20_000);
		expect(tracker.max, tracker.worst).toBeLessThanOrEqual(TOLERANCE);
	});

	it("throws the same messages and returns the same degenerate values", () => {
		for (const c of errorFixture.cases as ResultCase[]) {
			const call = () => spring(decodeParams(c.params) as SpringOptions);
			if (c.error !== undefined) expect(call, JSON.stringify(c.params)).toThrow(c.error);
			else expect(call()).toBe(decode(c.out as Encoded));
		}
	});
});

describe("measureSpring against the Remotion oracle", () => {
	it("returns exactly the same frame count for every case", () => {
		const cases = measureFixture.cases as ResultCase[];
		expect(cases.length).toBeGreaterThan(2800);
		for (const c of cases) {
			const call = () => measureSpring(decodeParams(c.params) as MeasureSpringOptions);
			if (c.error !== undefined) expect(call, JSON.stringify(c.params)).toThrow(c.error);
			else expect(call(), JSON.stringify(c.params)).toBe(decode(c.out as Encoded));
		}
	});
});

describe("spring", () => {
	it("starts at from and settles at to", () => {
		expect(spring({ frame: 0, fps: 30, from: 3, to: 7 })).toBe(3);
		expect(spring({ frame: 300, fps: 30, from: 3, to: 7 })).toBeCloseTo(7, 9);
	});

	it("never passes to with overshootClamping", () => {
		for (let frame = 0; frame < 60; frame++) {
			const value = spring({ frame, fps: 30, config: { damping: 3, overshootClamping: true } });
			expect(value).toBeLessThanOrEqual(1);
		}
	});

	it("holds the initial value during the delay", () => {
		expect(spring({ frame: 24, fps: 30, delay: 25 })).toBe(0);
		expect(spring({ frame: 26, fps: 30, delay: 25 })).toBeGreaterThan(0);
	});

	it("ends exactly at to after durationInFrames", () => {
		expect(spring({ frame: 41, fps: 30, durationInFrames: 40 })).toBe(1);
	});

	it("rejects zero damping, which would never settle", () => {
		expect(() => measureSpring({ fps: 30, config: { damping: 0 } })).toThrow(
			"Spring damping must be greater than 0",
		);
	});

	it("measures the documented example", () => {
		expect(measureSpring({ fps: 30, config: { damping: 200 } })).toBe(23);
	});
});

describe("measureSpring where Remotion never returns", () => {
	it("throws for zero stiffness instead of looping forever", () => {
		expect(() => measureSpring({ fps: 30, config: { stiffness: 0 } })).toThrow(
			"Spring stiffness must be greater than 0",
		);
		expect(() =>
			spring({ frame: 5, fps: 30, durationInFrames: 10, config: { stiffness: 0 } }),
		).toThrow("Spring stiffness must be greater than 0");
	});
});
