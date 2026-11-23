import { describe, expect, it } from "vitest";
import { atempoChain, sourceFilter } from "./filters.js";

describe("atempoChain", () => {
	it("returns no stage at rate 1", () => expect(atempoChain(1)).toEqual([]));
	it("keeps rates within [0.5, 2] in one stage", () => {
		expect(atempoChain(1.5)).toEqual([1.5]);
		expect(atempoChain(0.75)).toEqual([0.75]);
	});
	it("splits large and small rates into stages whose product is the rate", () => {
		for (const rate of [3, 4.5, 8, 0.3, 0.1]) {
			const stages = atempoChain(rate);
			expect(stages.every((s) => s >= 0.5 && s <= 2)).toBe(true);
			expect(stages.reduce((a, b) => a * b, 1)).toBeCloseTo(rate, 12);
		}
	});
	it("rejects non-positive and non-finite rates", () => {
		for (const rate of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
			expect(() => atempoChain(rate)).toThrow(RangeError);
	});
});

describe("sourceFilter", () => {
	it("trims, resamples and stretches in that order", () => {
		expect(
			sourceFilter({ trimSeconds: 0.2, playbackRate: 2, toneFrequency: 1, sampleRate: 48000 }),
		).toBe("atrim=start=0.2,asetpts=PTS-STARTPTS,aresample=48000,atempo=2");
	});
	it("shifts pitch with a compensated tempo", () => {
		expect(
			sourceFilter({ trimSeconds: 0, playbackRate: 1, toneFrequency: 2, sampleRate: 48000 }),
		).toBe("aresample=48000,asetrate=96000,aresample=48000,atempo=0.5");
	});
	it("resamples instead of stretching when the pitch follows the rate", () => {
		expect(
			sourceFilter({
				trimSeconds: 0,
				playbackRate: 2,
				toneFrequency: 1,
				sampleRate: 48000,
				preservePitch: false,
			}),
		).toBe("aresample=48000,asetrate=96000,aresample=48000");
	});
	it("rejects a non-positive playback rate", () => {
		expect(() =>
			sourceFilter({ trimSeconds: 0, playbackRate: 0, toneFrequency: 1, sampleRate: 48000 }),
		).toThrow(RangeError);
	});
});
