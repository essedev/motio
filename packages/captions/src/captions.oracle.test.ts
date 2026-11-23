import { describe, expect, it } from "vitest";
import tiktokFixture from "./__oracle__/create-tiktok-style-captions.json" with { type: "json" };
import { decodeDeep, expectOutcome, type Outcome, outcomeOf } from "./__oracle__/fixtures.js";
import srtFixture from "./__oracle__/parse-srt.json" with { type: "json" };
import vttFixture from "./__oracle__/parse-vtt.json" with { type: "json" };
import serializeFixture from "./__oracle__/serialize-srt.json" with { type: "json" };
import type { Caption } from "./caption.js";
import {
	type CreateTikTokStyleCaptionsInput,
	createTikTokStyleCaptions,
	type TikTokPage,
} from "./create-tiktok-style-captions.js";
import { parseSrt } from "./parse-srt.js";
import { parseVtt } from "./parse-vtt.js";
import { type SerializeSrtInput, serializeSrt } from "./serialize-srt.js";

// Every comparison is exact: captions are strings and integer or half-integer
// milliseconds, so there is no floating-point slack to allow. toStrictEqual
// also checks that optional keys (pageBreakAfter) appear exactly when Remotion
// emits them.

describe("parseSrt against the Remotion oracle", () => {
	type SrtCase = { input: string; tolerant: Outcome<Caption[]>; strict: Outcome<Caption[]> };
	const cases = decodeDeep<SrtCase[]>(srtFixture.cases);

	it(`matches tolerant parsing on ${cases.length} files`, () => {
		for (const c of cases) {
			expectOutcome(
				() => parseSrt({ input: c.input }).captions,
				c.tolerant,
				JSON.stringify(c.input),
			);
		}
	});

	it("matches strict parsing, failing on the same files at the same cue and line", () => {
		let succeeded = 0;
		for (const c of cases) {
			const parse = () => parseSrt({ input: c.input, strict: true }).captions;
			expectOutcome(parse, c.strict, JSON.stringify(c.input));
			if (c.strict.error === undefined) succeeded++;
		}
		expect(succeeded).toBeGreaterThan(300);
	});
});

describe("parseVtt against the Remotion oracle", () => {
	type VttCase = { input: string; result: Outcome<Caption[]> };
	const cases = decodeDeep<VttCase[]>(vttFixture.cases);

	it(`matches ${cases.length} files`, () => {
		for (const c of cases) {
			expectOutcome(() => parseVtt({ input: c.input }).captions, c.result, JSON.stringify(c.input));
		}
	});
});

describe("createTikTokStyleCaptions against the Remotion oracle", () => {
	type TikTokCase = {
		options: CreateTikTokStyleCaptionsInput;
		result: Outcome<{ pages: TikTokPage[] }>;
	};
	const cases = decodeDeep<TikTokCase[]>(tiktokFixture.cases);

	it(`matches ${cases.length} caption sets`, () => {
		for (const c of cases) {
			expect(
				outcomeOf(() => createTikTokStyleCaptions(c.options)),
				JSON.stringify(c.options),
			).toStrictEqual(c.result);
		}
	});
});

describe("serializeSrt against the Remotion oracle", () => {
	type SerializeCase = { input: SerializeSrtInput; result: Outcome<string> };
	const cases = decodeDeep<SerializeCase[]>(serializeFixture.cases);

	it(`matches ${cases.length} cue sets`, () => {
		for (const c of cases) {
			expect(
				outcomeOf(() => serializeSrt(c.input)),
				JSON.stringify(c.input),
			).toStrictEqual(c.result);
		}
	});
});
