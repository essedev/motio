// openAiWhisperApiToCaptions() and isOpenAiWhisperTranscript() against the published
// @remotion/openai-whisper over every recorded input (__oracle__/openai-whisper.json): the same
// captions, key order included, and the same inputs fail, with the same class, naming the same
// field (tools/oracle/record-transcription.mjs).
import { compareFailure } from "@motiojs/testing/oracle-errors";
import { decodeRecorded, encodeRecorded } from "@motiojs/testing/oracle-values";
import { describe, expect, it } from "vitest";
import oracle from "./__oracle__/openai-whisper.json" with { type: "json" };
import { isOpenAiWhisperTranscript, openAiWhisperApiToCaptions } from "./index.js";

type Recorded = { input: unknown; output?: unknown; error?: string; errorType?: string };

/** The field paths a recorded message names, such as words[1].start. */
const paths = (message: string) =>
	[...message.matchAll(/\b(?:transcription|text|words|segments)(?:\[\d+\])?(?:\.\w+)?/g)].map(
		(m) => m[0],
	);

describe("openAiWhisperApiToCaptions matches @remotion/openai-whisper", () => {
	it("converts or rejects every recorded transcription", () => {
		const cases = oracle.toCaptions as Recorded[];
		for (const [i, c] of cases.entries()) {
			const transcription = decodeRecorded(c.input);
			const at = `case ${i}: ${encodeRecorded(c.input).slice(0, 200)}`;
			let result: unknown;
			let thrown: unknown = null;
			try {
				result = openAiWhisperApiToCaptions({ transcription } as never);
			} catch (error) {
				thrown = error;
			}
			if (c.error === undefined) {
				expect(thrown, at).toBeNull();
				expect(encodeRecorded(result), at).toBe(JSON.stringify(c.output));
			} else {
				expect(thrown, `${at} should fail like: ${c.error}`).not.toBeNull();
				// Punctuation failures name no field; the others name the same one.
				const names = c.error.startsWith("Unable to parse") ? [] : paths(c.error);
				expect(
					compareFailure(thrown, { error: c.error, errorType: c.errorType }, names),
					at,
				).toBeUndefined();
			}
		}
		expect(cases.length).toBeGreaterThan(1000);
	});

	it("recognizes the same transcripts", () => {
		for (const c of oracle.isTranscript as Recorded[]) {
			expect(isOpenAiWhisperTranscript(decodeRecorded(c.input)), encodeRecorded(c.input)).toBe(
				c.output,
			);
		}
	});
});
