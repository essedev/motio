import { describe, expect, it } from "vitest";
import { loopLength, resolveTrim } from "./timing.js";
import { evaluateVolume, validateToneFrequency, validateVolumeProp } from "./volume.js";

describe("resolveTrim", () => {
	it("defaults to the whole source", () => {
		expect(resolveTrim({}, "Video")).toEqual({
			trimBefore: 0,
			durationInFrames: Number.POSITIVE_INFINITY,
		});
	});

	it("maps the deprecated startFrom and endAt", () => {
		expect(resolveTrim({ startFrom: 10, endAt: 40 }, "Video")).toEqual({
			trimBefore: 10,
			durationInFrames: 30,
		});
	});

	it("takes the shorter of trimAfter and durationInFrames", () => {
		expect(resolveTrim({ trimBefore: 5, trimAfter: 50, durationInFrames: 20 }, "Video")).toEqual({
			trimBefore: 5,
			durationInFrames: 20,
		});
		expect(resolveTrim({ trimBefore: 5, trimAfter: 15, durationInFrames: 20 }, "Video")).toEqual({
			trimBefore: 5,
			durationInFrames: 10,
		});
	});

	it("rejects mixing a deprecated name with its replacement", () => {
		expect(() => resolveTrim({ startFrom: 1, trimBefore: 2 }, "Html5Audio")).toThrow(
			/"startFrom" is the deprecated name of "trimBefore"/,
		);
		expect(() => resolveTrim({ endAt: 10, trimAfter: 20 }, "Html5Audio")).toThrow(/"endAt"/);
	});

	it("rejects negative trims, a non-positive duration and an empty range", () => {
		expect(() => resolveTrim({ trimBefore: -1 }, "Video")).toThrow(/non-negative/);
		expect(() => resolveTrim({ durationInFrames: 0 }, "Video")).toThrow(/positive/);
		expect(() => resolveTrim({ trimBefore: 10, trimAfter: 10 }, "Video")).toThrow(/greater/);
	});
});

describe("loopLength", () => {
	it("loops the selected range when it is finite", () => {
		expect(loopLength({ trimBefore: 0, durationInFrames: 45 }, null, 30)).toBe(45);
	});

	it("loops the rest of the media in whole frames", () => {
		expect(
			loopLength({ trimBefore: 10, durationInFrames: Number.POSITIVE_INFINITY }, 4.0, 30),
		).toBe(110);
		// 3.337 s at 30 fps is 100.11 frames: the loop is 100 frames long.
		expect(
			loopLength({ trimBefore: 0, durationInFrames: Number.POSITIVE_INFINITY }, 3.337, 30),
		).toBe(100);
	});

	it("is unknown until the duration is", () => {
		expect(
			loopLength({ trimBefore: 0, durationInFrames: Number.POSITIVE_INFINITY }, null, 30),
		).toBe(null);
	});
});

describe("volume", () => {
	it("evaluates numbers, and callbacks per loop behaviour", () => {
		const frame = { inIteration: 5, total: 65 };
		expect(evaluateVolume(undefined, frame, "repeat", "Audio")).toBe(1);
		expect(evaluateVolume(0.5, frame, "repeat", "Audio")).toBe(0.5);
		expect(evaluateVolume((f) => f / 100, frame, "repeat", "Audio")).toBe(0.05);
		expect(evaluateVolume((f) => f / 100, frame, "extend", "Audio")).toBe(0.65);
	});

	it("rejects invalid volumes and tone frequencies", () => {
		expect(() => validateVolumeProp(-1, "Audio")).toThrow(/non-negative/);
		expect(() => validateVolumeProp(Number.NaN, "Audio")).toThrow(/non-negative/);
		expect(() =>
			evaluateVolume(() => -0.1, { inIteration: 0, total: 0 }, "repeat", "Audio"),
		).toThrow(/must return a non-negative number/);
		expect(() => validateToneFrequency(0, "Audio")).toThrow(/from 0.01 to 2/);
		expect(() => validateToneFrequency(2.5, "Audio")).toThrow(/from 0.01 to 2/);
		expect(() => validateToneFrequency(1.5, "Audio")).not.toThrow();
	});
});
