import { describe, expect, it } from "vitest";
import { selectFrame, sourceTime } from "./select.js";

const at = (fps: number, n: number) => Array.from({ length: n }, (_, i) => i / fps);

describe("selectFrame", () => {
	it("floor picks the last frame not after t, tolerating float rounding", () => {
		const ts = at(60, 240);
		expect(selectFrame(ts, 1 / 30, "floor")).toBe(2);
		expect(selectFrame(ts, (1 / 60) * 2 - 1e-9, "floor")).toBe(2);
		expect(selectFrame(ts, 0.0249, "floor")).toBe(1);
	});
	it("nearest picks the closest frame, the later one on a tie", () => {
		const ts = at(24, 96);
		expect(selectFrame(ts, 1 / 30, "nearest")).toBe(1);
		expect(selectFrame(ts, 3 / 30, "nearest")).toBe(2);
		expect(selectFrame(ts, 0.5 / 24, "nearest")).toBe(1);
	});
	it("clamps before the first and after the last frame", () => {
		const ts = [0.1, 0.2, 0.3];
		expect(selectFrame(ts, 0, "floor")).toBe(0);
		expect(selectFrame(ts, 9, "nearest")).toBe(2);
	});
	it("works with variable frame rate timestamps", () => {
		const ts = [0, 0.04, 0.05, 0.2, 0.21];
		expect(selectFrame(ts, 0.1, "floor")).toBe(2);
		expect(selectFrame(ts, 0.13, "nearest")).toBe(3);
	});
});

describe("sourceTime", () => {
	it("applies trimBefore and playbackRate in composition frames", () => {
		expect(sourceTime({ frame: 0, fps: 30, trimBefore: 15 })).toBe(0.5);
		expect(sourceTime({ frame: 3, fps: 30, playbackRate: 2 })).toBe(0.2);
	});
});
