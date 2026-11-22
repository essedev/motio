import { describe, expect, it } from "vitest";
import {
	advance,
	fitScale,
	framesElapsed,
	playbackRange,
	startFrameForPlay,
} from "./frame-math.js";

describe("playbackRange", () => {
	it("covers the whole composition without in and out points", () => {
		expect(playbackRange(90, null, null)).toEqual({ start: 0, end: 89 });
	});
	it("uses inFrame and outFrame", () => {
		expect(playbackRange(90, 10, 40)).toEqual({ start: 10, end: 40 });
		expect(playbackRange(90, 10, null)).toEqual({ start: 10, end: 89 });
		expect(playbackRange(90, null, 40)).toEqual({ start: 0, end: 40 });
	});
});

describe("framesElapsed", () => {
	it("counts whole frames at the given fps", () => {
		expect(framesElapsed(0, 30, 1)).toBe(0);
		expect(framesElapsed(33, 30, 1)).toBe(0);
		expect(framesElapsed(1000 / 30, 30, 1)).toBe(1);
		expect(framesElapsed(1000, 30, 1)).toBe(30);
		expect(framesElapsed(1000, 24, 1)).toBe(24);
	});
	it("scales with the playback rate and is negative backwards", () => {
		expect(framesElapsed(1000, 30, 2)).toBe(60);
		expect(framesElapsed(1000, 30, 0.5)).toBe(15);
		expect(framesElapsed(1000, 30, -1)).toBe(-30);
		expect(framesElapsed(1000, 30, -2)).toBe(-60);
	});
	it("ignores negative elapsed time", () => {
		expect(framesElapsed(-50, 30, 1)).toBe(0);
	});
});

describe("advance", () => {
	const range = { start: 0, end: 89 };
	it("moves inside the range", () => {
		expect(advance(10, 5, range, false)).toEqual({ frame: 15, ended: false });
		expect(advance(10, -5, range, false)).toEqual({ frame: 5, ended: false });
	});
	it("stops at the last frame and reports the end without loop", () => {
		expect(advance(80, 9, range, false)).toEqual({ frame: 89, ended: false });
		expect(advance(80, 10, range, false)).toEqual({ frame: 89, ended: true });
		expect(advance(5, -6, range, false)).toEqual({ frame: 0, ended: true });
	});
	it("wraps with loop, in both directions", () => {
		expect(advance(80, 10, range, true)).toEqual({ frame: 0, ended: false });
		expect(advance(80, 25, range, true)).toEqual({ frame: 15, ended: false });
		expect(advance(5, -6, range, true)).toEqual({ frame: 89, ended: false });
		expect(advance(0, 270, range, true)).toEqual({ frame: 0, ended: false });
	});
	it("wraps inside in and out points", () => {
		const r = { start: 10, end: 19 };
		expect(advance(18, 3, r, true)).toEqual({ frame: 11, ended: false });
		expect(advance(18, 3, r, false)).toEqual({ frame: 19, ended: true });
		expect(advance(11, -3, r, true)).toEqual({ frame: 18, ended: false });
	});
	it("keeps playing toward the range from a frame before it", () => {
		expect(advance(2, 3, { start: 10, end: 19 }, false)).toEqual({ frame: 5, ended: false });
	});
});

describe("startFrameForPlay", () => {
	const range = { start: 10, end: 40 };
	it("continues from the current frame inside the range", () => {
		expect(startFrameForPlay(20, range, 1)).toBe(20);
		expect(startFrameForPlay(20, range, -1)).toBe(20);
	});
	it("restarts from the beginning at the end or outside the range", () => {
		expect(startFrameForPlay(40, range, 1)).toBe(10);
		expect(startFrameForPlay(5, range, 1)).toBe(10);
		expect(startFrameForPlay(60, range, 1)).toBe(10);
	});
	it("restarts from the end when playing backwards", () => {
		expect(startFrameForPlay(10, range, -1)).toBe(40);
		expect(startFrameForPlay(60, range, -2)).toBe(40);
	});
});

describe("fitScale", () => {
	it("fits the composition in the box keeping the aspect ratio", () => {
		expect(fitScale(960, 540, 1920, 1080)).toBe(0.5);
		expect(fitScale(960, 1000, 1920, 1080)).toBe(0.5);
		expect(fitScale(2000, 540, 1920, 1080)).toBe(0.5);
	});
	it("is 1 for an empty box", () => {
		expect(fitScale(0, 0, 1920, 1080)).toBe(1);
	});
});
