import { describe, expect, it } from "vitest";
import { createTikTokStyleCaptions, parseSrt, parseVtt, serializeSrt } from "./index.js";

describe("captions", () => {
	it("round-trips SubRip through parseSrt and serializeSrt", () => {
		const input =
			"1\n00:00:00,000 --> 00:00:02,500\nHello\nworld\n\n2\n01:02:03,004 --> 01:02:04,000\nBye";
		const { captions } = parseSrt({ input, strict: true });
		expect(captions.map((c) => c.timestampMs)).toEqual([1250, 3723502]);
		expect(serializeSrt({ lines: captions.map((c) => [c]) })).toBe(input);
	});

	it("names the cue and line of a strict parsing error", () => {
		expect(() =>
			parseSrt({ input: "1\n00:00:01,000 --> 00:00:02,000\nA\n\n2\n00:00:03,000\n", strict: true }),
		).toThrow('Line 6 (cue 2) should be the cue timing "start --> end", but is "00:00:03,000".');
	});

	it("strips WebVTT markup and decodes character references", () => {
		const { captions } = parseVtt({
			input:
				"WEBVTT\n\nNOTE skipped\n\nid\n00:01.000 --> 00:02.000 align:start\n<v Ann>Fish &amp; <i>chips</i></v> &#x1F41F;",
		});
		expect(captions).toEqual([
			{ text: "Fish & chips 🐟", startMs: 1000, endMs: 2000, timestampMs: 1500, confidence: 1 },
		]);
	});

	it("breaks TikTok pages on pageBreakAfter and keeps the page on screen until the next one", () => {
		const word = (text: string, startMs: number, endMs: number, pageBreakAfter?: boolean) => ({
			text,
			startMs,
			endMs,
			timestampMs: null,
			confidence: null,
			...(pageBreakAfter === undefined ? {} : { pageBreakAfter }),
		});
		const { pages } = createTikTokStyleCaptions({
			captions: [word("One", 0, 100, true), word(" two", 500, 600), word(" three", 600, 700)],
			combineTokensWithinMilliseconds: 10_000,
		});
		expect(pages.map((p) => [p.text, p.startMs, p.durationMs])).toEqual([
			["One", 0, 500],
			["two three", 500, 200],
		]);
		expect(pages[0]?.tokens[0]?.pageBreakAfter).toBe(true);
	});
});
