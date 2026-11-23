import { describe, expect, it } from "vitest";
import { FULL_RANGE, fitRange, rangeBounds, setInPoint, setOutPoint } from "./range.js";

describe("loop range", () => {
	it("sets in and out points", () => {
		const withIn = setInPoint(FULL_RANGE, 10);
		expect(withIn).toEqual({ inFrame: 10, outFrame: null });
		expect(setOutPoint(withIn, 20, 100)).toEqual({ inFrame: 10, outFrame: 20 });
	});

	it("drops the other point when they would cross, as the Player needs in < out", () => {
		expect(setInPoint({ inFrame: null, outFrame: 20 }, 20)).toEqual({
			inFrame: 20,
			outFrame: null,
		});
		expect(setInPoint({ inFrame: null, outFrame: 20 }, 25)).toEqual({
			inFrame: 25,
			outFrame: null,
		});
		expect(setOutPoint({ inFrame: 30, outFrame: null }, 30, 100)).toEqual({
			inFrame: null,
			outFrame: 30,
		});
	});

	it("treats the first and last frames as no point", () => {
		expect(setInPoint({ inFrame: 5, outFrame: 20 }, 0)).toEqual({ inFrame: null, outFrame: 20 });
		expect(setOutPoint({ inFrame: 5, outFrame: 20 }, 99, 100)).toEqual({
			inFrame: 5,
			outFrame: null,
		});
	});

	it("drops points outside a shorter composition", () => {
		expect(fitRange({ inFrame: 10, outFrame: 50 }, 40)).toEqual({ inFrame: 10, outFrame: null });
		expect(fitRange({ inFrame: 45, outFrame: 50 }, 40)).toEqual({ inFrame: null, outFrame: null });
		expect(fitRange({ inFrame: 10, outFrame: 20 }, 40)).toEqual({ inFrame: 10, outFrame: 20 });
	});

	it("gives the bounds playback covers", () => {
		expect(rangeBounds(FULL_RANGE, 30)).toEqual([0, 29]);
		expect(rangeBounds({ inFrame: 3, outFrame: 9 }, 30)).toEqual([3, 9]);
	});
});
