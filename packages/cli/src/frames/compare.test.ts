import { describe, expect, it } from "vitest";
import { determinismRuns } from "../commands/check.js";
import { encodePng } from "../test-support/fakes.js";
import {
	blockFlicker,
	blockThresholdFor,
	compareRuns,
	diagnoseMismatches,
	formatFrameList,
	hashPixels,
	isFlicker,
	meanAbsoluteDifference,
	pixelDifference,
	pngSize,
	unionRegion,
} from "./compare.js";

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

describe("determinism report", () => {
	it("folds consecutive frames into ranges", () => {
		expect(formatFrameList(Array.from({ length: 30 }, (_, i) => i))).toBe("0-29");
		expect(formatFrameList([12, 3, 5, 6, 7])).toBe("3, 5-7, 12");
		expect(formatFrameList([4])).toBe("4");
	});

	// Runs: ascending x1, descending x1, ascending x4, descending x4.
	const runs = determinismRuns(4);
	const diagnose = (hashes: string[]) => diagnoseMismatches([{ frame: 0, hashes }], runs).cause;

	it("reads the cause from which runs disagree", () => {
		expect(diagnose(["a", "b", "c", "d"])).toBe("random");
		expect(diagnose(["a", "b", "a", "b"])).toBe("order");
		expect(diagnose(["a", "a", "b", "a"])).toBe("race");
		expect(diagnose(["a", "a", "b", "c"])).toBe("race");
		expect(diagnose(["a", "b", "c", "b"])).toBe("mixed");
		const fresh = determinismRuns("50%", "fresh");
		expect(diagnoseMismatches([{ frame: 0, hashes: ["f", "a", "a", "a", "a"] }], fresh).cause).toBe(
			"history",
		);
	});

	it("calls frames with different causes mixed and explains each cause", () => {
		const result = diagnoseMismatches(
			[
				{ frame: 0, hashes: ["a", "b", "a", "b"] },
				{ frame: 1, hashes: ["a", "a", "b", "a"] },
			],
			runs,
		);
		expect(result.cause).toBe("mixed");
		expect(diagnoseMismatches([{ frame: 0, hashes: ["a", "b", "a", "b"] }], runs).message).toMatch(
			/depends on the frame rendered before it/,
		);
	});
	it("calls differences of a few lines of pixels rasterisation, with the run pattern beside", () => {
		const size = { width: 640, height: 360 };
		// One antialiased column of a seam, rendered differently in every run.
		const seam = { frame: 4, hashes: ["a", "b", "c", "d"], differingPixels: 360 };
		const result = diagnoseMismatches([seam], runs, size);
		expect(result).toMatchObject({ cause: "raster", pattern: "random" });
		expect(result.message).toMatch(/at most 360 pixels/);
		expect(result.message).toMatch(/Math\.random/);
		// A moving element drawn elsewhere changes far more than four lines of pixels.
		const content = { ...seam, differingPixels: 4 * 640 + 1 };
		expect(diagnoseMismatches([content], runs, size).cause).toBe("random");
		// Without measurements the run pattern decides, as before.
		expect(diagnoseMismatches([{ frame: 4, hashes: seam.hashes }], runs, size).cause).toBe(
			"random",
		);
		expect(diagnoseMismatches([seam], runs).cause).toBe("random");
	});
});

describe("pixel difference", () => {
	it("counts the differing pixels and bounds them", () => {
		const a = new Uint8Array(8 * 4 * 4).fill(10);
		const b = Uint8Array.from(a);
		expect(pixelDifference(a, b, 8)).toBeNull();
		b[(1 * 8 + 2) * 4 + 3] = 200; // alpha only, at x 2, y 1
		b[(3 * 8 + 5) * 4] = 0; // red, at x 5, y 3
		expect(pixelDifference(a, b, 8)).toEqual({
			pixels: 2,
			region: { x: 2, y: 1, width: 4, height: 3 },
		});
		expect(() => pixelDifference(a, b.subarray(4), 8)).toThrow(/different sizes/);
	});

	it("unites regions", () => {
		const r = unionRegion(undefined, { x: 4, y: 4, width: 2, height: 2 });
		expect(unionRegion(r, { x: 1, y: 5, width: 1, height: 4 })).toEqual({
			x: 1,
			y: 4,
			width: 5,
			height: 5,
		});
	});
});

describe("block flicker", () => {
	const width = 1920;
	const height = 1080;
	/** A dark frame with 30 white dots of 20 px at positions drawn from `seed`. */
	function dots(seed: number): Uint8Array {
		const frame = new Uint8Array(width * height * 4).fill(20);
		let state = seed;
		const next = () => {
			state = (state * 1103515245 + 12345) % 2147483648;
			return state / 2147483648;
		};
		for (let d = 0; d < 30; d++) {
			const x0 = Math.floor(next() * (width - 20));
			const y0 = Math.floor(next() * (height - 20));
			for (let y = y0; y < y0 + 20; y++)
				frame.fill(255, (y * width + x0) * 4, (y * width + x0 + 20) * 4);
		}
		return frame;
	}
	/** Vertical stripes 40 px wide, shifted `offset` px to the right. */
	function stripes(offset: number): Uint8Array {
		const frame = new Uint8Array(width * height * 4);
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				frame.fill(
					Math.floor((x - offset) / 40) % 2 === 0 ? 230 : 30,
					(y * width + x) * 4,
					(y * width + x) * 4 + 4,
				);
			}
		}
		return frame;
	}
	const options = { threshold: blockThresholdFor(0.02) };

	it("catches dots at random positions every frame, which the mean difference misses", () => {
		const [previous, current, next] = [dots(1), dots(2), dots(3)];
		const mean = [
			meanAbsoluteDifference(previous, current),
			meanAbsoluteDifference(current, next),
			meanAbsoluteDifference(previous, next),
		] as const;
		expect(isFlicker(...mean, { threshold: 0.02 })).toBe(false);
		const result = blockFlicker(previous, current, next, width, height, options);
		expect(result?.blocks).toBeGreaterThanOrEqual(30);
		expect(result?.maxDiff).toBeGreaterThan(0.5);
	});

	it("leaves a slow pan and a still frame alone", () => {
		expect(blockFlicker(stripes(0), stripes(3), stripes(6), width, height, options)).toBeNull();
		const still = dots(7);
		expect(blockFlicker(still, still, still, width, height, options)).toBeNull();
	});

	/** A dark 256x128 frame with a white 10x14 arrow-like mark (a cursor) at `x`, `y`. */
	function cursorAt(x: number, y: number): Uint8Array {
		const frame = new Uint8Array(256 * 128 * 4).fill(30);
		for (let row = 0; row < 14; row++) {
			const span = Math.max(1, Math.round((row * 10) / 14));
			frame.fill(240, ((y + row) * 256 + x) * 4, ((y + row) * 256 + x + span) * 4);
		}
		return frame;
	}

	it("leaves a small element alone that moves more than a block per frame", () => {
		const path = [20, 44, 68, 92, 116, 140];
		for (let i = 1; i < path.length - 1; i++) {
			const at = (k: number) =>
				cursorAt(path[k] as number, 40 + Math.round((path[k] as number) / 4));
			expect(blockFlicker(at(i - 1), at(i), at(i + 1), 256, 128, options), `step ${i}`).toBeNull();
		}
	});

	it("still flags a small element that jumps away for one frame and comes back", () => {
		const home = cursorAt(100, 50);
		const away = cursorAt(130, 50);
		expect(blockFlicker(home, away, home, 256, 128, options)?.blocks).toBeGreaterThan(0);
	});

	it("locates a single element shown for one frame", () => {
		const blank = new Uint8Array(64 * 64 * 4).fill(0);
		const flash = Uint8Array.from(blank);
		for (let y = 32; y < 48; y++) flash.fill(255, (y * 64 + 16) * 4, (y * 64 + 32) * 4);
		expect(blockFlicker(blank, flash, blank, 64, 64, options)).toEqual({
			blocks: 1,
			region: { x: 16, y: 32, width: 16, height: 16 },
			maxDiff: 1,
		});
	});
});
