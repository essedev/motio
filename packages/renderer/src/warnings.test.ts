import { describe, expect, it } from "vitest";
import { WarningCollector } from "./warnings.js";

describe("WarningCollector", () => {
	it("reports a warning every page sends once per render, with the first frame", () => {
		const c = new WarningCollector();
		const random = {
			code: "W_MATH_RANDOM" as const,
			key: "Math.random",
			message: "Math.random() was called while a frame rendered.",
		};
		// Eight pages, each reporting it on the first frame it rendered.
		for (const frame of [5, 3, 9, 0, 7, 2, 8, 4]) c.add([random], frame);
		expect(c.list()).toEqual([{ code: "W_MATH_RANDOM", message: random.message, frame: 0 }]);
	});

	it("collapses messages with varying values under one key and keeps the first message", () => {
		const c = new WarningCollector();
		c.add([{ code: "W_SLOW_READINESS", key: 'delayRender("api")', message: "open for 1600ms" }], 4);
		c.add([{ code: "W_SLOW_READINESS", key: 'delayRender("api")', message: "open for 1900ms" }], 2);
		c.add(
			[{ code: "W_SLOW_READINESS", key: 'delayRender("font")', message: "open for 1700ms" }],
			6,
		);
		expect(c.list()).toEqual([
			{ code: "W_SLOW_READINESS", message: "open for 1600ms", frame: 2 },
			{ code: "W_SLOW_READINESS", message: "open for 1700ms", frame: 6 },
		]);
	});

	it("identifies a warning without a key by its code and message", () => {
		const c = new WarningCollector();
		c.add([{ code: "W_FONT_FALLBACK", message: 'Font "A" is not available.' }], 1);
		c.add([{ code: "W_FONT_FALLBACK", message: 'Font "B" is not available.' }], 1);
		c.add([{ code: "W_FONT_FALLBACK", message: 'Font "A" is not available.' }], 0);
		c.add([{ code: "W_FFMPEG_FALLBACK", message: "fallback" }]);
		expect(c.list()).toEqual([
			{ code: "W_FONT_FALLBACK", message: 'Font "A" is not available.', frame: 0 },
			{ code: "W_FONT_FALLBACK", message: 'Font "B" is not available.', frame: 1 },
			{ code: "W_FFMPEG_FALLBACK", message: "fallback" },
		]);
	});
});
