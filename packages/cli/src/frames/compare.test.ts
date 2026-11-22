import { describe, expect, it } from "vitest";
import { encodePng } from "../test-support/fakes.js";
import { compareRuns, hashPixels, isFlicker, meanAbsoluteDifference, pngSize } from "./compare.js";

const solid = (value: number, alpha = 255) =>
	new Uint8Array([value, value, value, alpha, value, value, value, alpha]);

describe("frame comparison", () => {
	it("measures the mean RGB difference and ignores alpha", () => {
		expect(meanAbsoluteDifference(solid(0), solid(255))).toBe(1);
		expect(meanAbsoluteDifference(solid(10), solid(10, 0))).toBe(0);
		expect(meanAbsoluteDifference(solid(0), solid(51))).toBeCloseTo(0.2);
		expect(() => meanAbsoluteDifference(solid(0), new Uint8Array(4))).toThrow(/different sizes/);
	});

	it("hashes pixels", () => {
		expect(hashPixels(solid(1))).toBe(hashPixels(solid(1)));
		expect(hashPixels(solid(1))).not.toBe(hashPixels(solid(2)));
	});

	it("finds frames whose hash differs in any run", () => {
		const a = new Map([
			[0, "x"],
			[1, "y"],
		]);
		const b = new Map([
			[0, "x"],
			[1, "z"],
		]);
		expect(compareRuns([a, a, b])).toEqual([{ frame: 1, hashes: ["y", "y", "z"] }]);
		expect(compareRuns([a, a])).toEqual([]);
		expect(compareRuns([])).toEqual([]);
	});

	it("tells a glitch from motion", () => {
		expect(isFlicker(0.3, 0.3, 0.01, { threshold: 0.02 })).toBe(true);
		expect(isFlicker(0.3, 0.3, 0.6, { threshold: 0.02 })).toBe(false);
		expect(isFlicker(0.01, 0.3, 0, { threshold: 0.02 })).toBe(false);
	});

	it("reads PNG dimensions", () => {
		expect(pngSize(encodePng(7, 3, () => [0, 0, 0, 255]))).toEqual({ width: 7, height: 3 });
		expect(() => pngSize(new Uint8Array(30))).toThrow(/Not a PNG/);
	});
});
