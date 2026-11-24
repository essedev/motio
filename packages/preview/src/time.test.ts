import { describe, expect, it } from "vitest";
import { clampFrame, formatDuration, formatFps, formatTimecode } from "./time.js";

describe("formatTimecode", () => {
	it.each([
		[0, 30, "00:00:00:00"],
		[29, 30, "00:00:00:29"],
		[30, 30, "00:00:01:00"],
		[30 * 61 + 5, 30, "00:01:01:05"],
		[30 * 3600, 30, "01:00:00:00"],
		[59, 60, "00:00:00:59"],
		[119, 120, "00:00:00:119"],
		// 29.97 fps: second 1 starts at frame 30 (29.97 rounded up), second 2 at frame 60.
		[29, 29.97, "00:00:00:29"],
		[30, 29.97, "00:00:01:00"],
		[59, 29.97, "00:00:01:29"],
		[60, 29.97, "00:00:02:00"],
		[0, 1, "00:00:00:00"],
		[5, 1, "00:00:05:00"],
	])("frame %i at %f fps is %s", (frame, fps, expected) => {
		expect(formatTimecode(frame, fps)).toBe(expected);
	});

	it("never shows more frames than the second holds", () => {
		for (const fps of [23.976, 29.97, 59.94, 24, 25]) {
			for (let frame = 0; frame < fps * 20; frame++) {
				const frames = Number(formatTimecode(frame, fps).split(":")[3]);
				expect(frames).toBeLessThan(Math.ceil(fps));
			}
		}
	});
});

describe("helpers", () => {
	it("clamps frames to the composition", () => {
		expect(clampFrame(-3, 30)).toBe(0);
		expect(clampFrame(12.4, 30)).toBe(12);
		expect(clampFrame(40, 30)).toBe(29);
		expect(clampFrame(Number.NaN, 30)).toBe(0);
	});

	it("formats durations and frame rates", () => {
		expect(formatDuration(90, 30)).toBe("3.00 s");
		expect(formatFps(30)).toBe("30");
		expect(formatFps(30000 / 1001)).toBe("29.97");
	});
});
