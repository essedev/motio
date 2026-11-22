import { Easing, measureSpring, spring } from "@motiojs/core";
import { describe, expect, it } from "vitest";
import { linearTiming } from "./linear-timing.js";
import { springTiming } from "./spring-timing.js";

describe("linearTiming()", () => {
	it("lasts durationInFrames and advances linearly from 0 to 1", () => {
		const timing = linearTiming({ durationInFrames: 10 });
		expect(timing.getDurationInFrames({ fps: 30 })).toBe(10);
		// Frame 5 of 10 is halfway: the fade of the features fixture at frame 25 is a 50% mix.
		expect([0, 5, 9, 10].map((frame) => timing.getProgress({ frame, fps: 30 }))).toEqual([
			0, 0.5, 0.9, 1,
		]);
	});

	it("clamps outside of the transition", () => {
		const timing = linearTiming({ durationInFrames: 10 });
		expect(timing.getProgress({ frame: -3, fps: 30 })).toBe(0);
		expect(timing.getProgress({ frame: 15, fps: 30 })).toBe(1);
	});

	it("applies the easing to the progress", () => {
		const easing = Easing.in(Easing.ease);
		const timing = linearTiming({ durationInFrames: 30, easing });
		expect(timing.getProgress({ frame: 12, fps: 30 })).toBeCloseTo(easing(12 / 30), 12);
	});

	it("rejects an invalid duration or easing", () => {
		expect(() => linearTiming({ durationInFrames: -1 })).toThrow(/non-negative finite/);
		expect(() => linearTiming({ durationInFrames: Number.NaN })).toThrow(/durationInFrames/);
		expect(() =>
			linearTiming({ durationInFrames: 10, easing: 3 as unknown as (n: number) => number }),
		).toThrow(/easing/);
	});
});

describe("springTiming()", () => {
	it("lasts as long as the spring takes to settle (docs: damping 200 at 30 fps is 23)", () => {
		expect(springTiming({ config: { damping: 200 } }).getDurationInFrames({ fps: 30 })).toBe(23);
		expect(springTiming().getDurationInFrames({ fps: 30 })).toBe(measureSpring({ fps: 30 }));
	});

	it("measures with durationRestThreshold, so a lower threshold is longer", () => {
		const loose = springTiming({ config: { damping: 200 } }).getDurationInFrames({ fps: 30 });
		const tight = springTiming({
			config: { damping: 200 },
			durationRestThreshold: 0.001,
		}).getDurationInFrames({ fps: 30 });
		expect(tight).toBe(measureSpring({ fps: 30, config: { damping: 200 }, threshold: 0.001 }));
		expect(tight).toBeGreaterThan(loose);
	});

	it("uses a fixed durationInFrames and stretches the spring to it", () => {
		const timing = springTiming({ config: { damping: 200 }, durationInFrames: 12 });
		expect(timing.getDurationInFrames({ fps: 30 })).toBe(12);
		for (const frame of [0, 3, 6, 11, 12]) {
			expect(timing.getProgress({ frame, fps: 30 })).toBe(
				spring({ frame, fps: 30, config: { damping: 200 }, durationInFrames: 12 }),
			);
		}
	});

	it("passes reverse to spring()", () => {
		const timing = springTiming({ durationInFrames: 20, reverse: true });
		expect(timing.getProgress({ frame: 5, fps: 30 })).toBe(
			spring({ frame: 5, fps: 30, durationInFrames: 20, reverse: true }),
		);
	});

	it("rejects a non-positive durationInFrames", () => {
		expect(() => springTiming({ durationInFrames: 0 })).toThrow(/positive finite/);
	});
});
