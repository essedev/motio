// toCaptions() against the published @remotion/install-whisper-cpp over every recorded input
// (__oracle__/to-captions.json: a real transcription, edge cases, seeded random outputs): the same
// captions, key order included, and the same inputs fail with the same class.
import { compareFailure } from "@motiojs/testing/oracle-errors";
import { decodeRecorded, encodeRecorded } from "@motiojs/testing/oracle-values";
import { describe, expect, it } from "vitest";
import oracle from "./__oracle__/to-captions.json" with { type: "json" };
import { toCaptions } from "./index.js";

type Recorded = { input: unknown; output?: unknown; error?: string; errorType?: string };

describe("toCaptions matches @remotion/install-whisper-cpp", () => {
	it("converts or rejects every recorded output", () => {
		const cases = oracle.cases as Recorded[];
		for (const [i, c] of cases.entries()) {
			const at = `case ${i}: ${encodeRecorded(c.input).slice(0, 200)}`;
			let result: unknown;
			let thrown: unknown = null;
			try {
				result = toCaptions(decodeRecorded(c.input) as never);
			} catch (error) {
				thrown = error;
			}
			if (c.error === undefined) {
				expect(thrown, at).toBeNull();
				expect(encodeRecorded(result), at).toBe(JSON.stringify(c.output));
			} else {
				expect(thrown, `${at} should fail like: ${c.error}`).not.toBeNull();
				expect(
					compareFailure(thrown, { error: c.error, errorType: c.errorType }),
					at,
				).toBeUndefined();
			}
		}
		expect(cases.length).toBeGreaterThan(80);
	});
});
