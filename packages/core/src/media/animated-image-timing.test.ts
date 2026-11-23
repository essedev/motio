import { describe, expect, it } from "vitest";
import {
	animatedImageFrameAt,
	animatedImageTimeAt,
	animatedImageTimeline,
	ZERO_DURATION_US,
} from "./animated-image-timing.js";

const ms = (values: number[]) => values.map((v) => v * 1000);
// The fixture's durations (fixtures/animated-image/frames.json): starts 0, 100, 150, 350, 430,
// 550, 610, 760; one play is 800 ms.
const FIXTURE = animatedImageTimeline(ms([100, 50, 200, 80, 120, 60, 150, 40]));

describe("animatedImageTimeline", () => {
	it("starts each frame at the sum of the previous durations", () => {
		expect(FIXTURE.starts).toEqual(ms([0, 100, 150, 350, 430, 550, 610, 760]));
		expect(FIXTURE.total).toBe(800_000);
	});

	it("gives a frame with a duration of 0, missing or invalid 100 ms", () => {
		const timeline = animatedImageTimeline([0, 10_000, null, -5, Number.NaN, 20_000]);
		expect(timeline.durations).toEqual([
			ZERO_DURATION_US,
			10_000,
			ZERO_DURATION_US,
			ZERO_DURATION_US,
			ZERO_DURATION_US,
			20_000,
		]);
		expect(timeline.starts).toEqual([0, 100_000, 110_000, 210_000, 310_000, 410_000]);
		expect(ZERO_DURATION_US).toBe(100_000);
	});

	it("shows a still image forever", () => {
		const still = animatedImageTimeline([null], false);
		expect(still.total).toBe(Number.POSITIVE_INFINITY);
		for (const behavior of ["loop", "pause-after-finish", "clear-after-finish"]) {
			expect(animatedImageFrameAt(still, 3_600_000_000, behavior)).toBe(0);
		}
	});

	it("an image without frames shows nothing", () => {
		expect(animatedImageFrameAt(animatedImageTimeline([]), 0)).toBeNull();
		expect(animatedImageFrameAt(animatedImageTimeline([], false), 0)).toBeNull();
	});
});

describe("animatedImageFrameAt", () => {
	it("shows the frame whose interval contains the time: start inclusive, end exclusive", () => {
		const at = (t: number) => animatedImageFrameAt(FIXTURE, t * 1000);
		expect([at(0), at(99.999), at(100), at(149.999), at(150), at(759.999), at(760)]).toEqual([
			0, 0, 1, 1, 2, 6, 7,
		]);
		expect(at(799.999)).toBe(7);
	});

	it("loops by default and for unknown loop behaviours", () => {
		for (const behavior of ["loop", "x", ""]) {
			expect(animatedImageFrameAt(FIXTURE, 800_000, behavior)).toBe(0);
			expect(animatedImageFrameAt(FIXTURE, 1_000_000, behavior)).toBe(2);
			expect(animatedImageFrameAt(FIXTURE, 8_000_000 + 760_000, behavior)).toBe(7);
		}
	});

	it("pause-after-finish holds the last frame from the end of the play", () => {
		expect(animatedImageFrameAt(FIXTURE, 799_999, "pause-after-finish")).toBe(7);
		expect(animatedImageFrameAt(FIXTURE, 800_000, "pause-after-finish")).toBe(7);
		expect(animatedImageFrameAt(FIXTURE, 9_000_000, "pause-after-finish")).toBe(7);
		expect(animatedImageFrameAt(FIXTURE, 120_000, "pause-after-finish")).toBe(1);
	});

	it("clear-after-finish shows nothing from the end of the play", () => {
		expect(animatedImageFrameAt(FIXTURE, 799_999, "clear-after-finish")).toBe(7);
		expect(animatedImageFrameAt(FIXTURE, 800_000, "clear-after-finish")).toBeNull();
		expect(animatedImageFrameAt(FIXTURE, 9_000_000, "clear-after-finish")).toBeNull();
	});

	it("shows the first frame for negative and non-finite times", () => {
		expect(animatedImageFrameAt(FIXTURE, -1)).toBe(0);
		expect(animatedImageFrameAt(FIXTURE, Number.NaN)).toBe(0);
	});

	it("finds frames in a long image", () => {
		const long = animatedImageTimeline(Array.from({ length: 10_000 }, (_, i) => (i % 7) + 1));
		for (const i of [0, 1, 4999, 9999]) {
			expect(animatedImageFrameAt(long, long.starts[i] as number)).toBe(i);
			expect(animatedImageFrameAt(long, (long.starts[i] as number) + 0.5)).toBe(i);
		}
	});
});

describe("animatedImageTimeAt", () => {
	it("puts video frames that fall on an image frame boundary exactly on it", () => {
		// 3 / 30 * 1e6 is 100000.00000000001 in floating point without the rounding.
		expect(animatedImageTimeAt(3, 30)).toBe(100_000);
		expect(animatedImageFrameAt(FIXTURE, animatedImageTimeAt(3, 30))).toBe(1);
		// Fractional frames from a playbackRate of 1.7.
		expect(animatedImageTimeAt(15 * 1.7, 30)).toBe(850_000);
		expect(animatedImageTimeAt(6, 24)).toBe(250_000);
		expect(animatedImageTimeAt(9, 60)).toBe(150_000);
	});
});
