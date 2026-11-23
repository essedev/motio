// elevenLabsTranscriptToCaptions() and detectElevenLabsTranscriptFormat() against the published
// @remotion/elevenlabs over every recorded input (__oracle__/elevenlabs.json): the same
// captions, key order included, and the same inputs fail, with the same class, naming the same
// field (tools/oracle/record-transcription.mjs).
import { compareFailure } from "@motiojs/testing/oracle-errors";
import { decodeRecorded, encodeRecorded } from "@motiojs/testing/oracle-values";
import { describe, expect, it } from "vitest";
import oracle from "./__oracle__/elevenlabs.json" with { type: "json" };
import { detectElevenLabsTranscriptFormat, elevenLabsTranscriptToCaptions } from "./index.js";

type Recorded = { input: unknown; output?: unknown; error?: string; errorType?: string };

/** The field paths a recorded message names, such as segments[0].words[1].end_time. */
const paths = (message: string) =>
	[
		...message.matchAll(/\b(?:language_code|segments|words)(?:\[\d+\])*(?:\.\w+(?:\[\d+\])?)*/g),
	].map((m) => m[0]);

describe("elevenLabsTranscriptToCaptions matches @remotion/elevenlabs", () => {
	it("converts or rejects every recorded transcript", () => {
		const cases = oracle.toCaptions as Recorded[];
		for (const [i, c] of cases.entries()) {
			const transcript = decodeRecorded(c.input);
			const at = `case ${i}: ${encodeRecorded(c.input).slice(0, 200)}`;
			let result: unknown;
			let thrown: unknown = null;
			try {
				result = elevenLabsTranscriptToCaptions({ transcript } as never);
			} catch (error) {
				thrown = error;
			}
			if (c.error === undefined) {
				expect(thrown, at).toBeNull();
				expect(encodeRecorded(result), at).toBe(JSON.stringify(c.output));
			} else {
				expect(thrown, `${at} should fail like: ${c.error}`).not.toBeNull();
				const names = paths(c.error);
				expect(
					compareFailure(thrown, { error: c.error, errorType: c.errorType }, names),
					at,
				).toBeUndefined();
			}
		}
		expect(cases.length).toBeGreaterThan(500);
	});

	it("detects the same formats", () => {
		for (const c of oracle.detect as Recorded[]) {
			expect(
				detectElevenLabsTranscriptFormat(decodeRecorded(c.input)),
				encodeRecorded(c.input),
			).toBe(c.output);
		}
	});
});
