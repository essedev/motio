import type { Caption } from "@motiojs/captions";
import type { OpenAiVerboseTranscription } from "./types.js";
import { validateTranscription } from "./validate.js";

/** Input of {@link openAiWhisperApiToCaptions}. */
export interface OpenAiToCaptionsInput {
	transcription: OpenAiVerboseTranscription;
}

/** Output of {@link openAiWhisperApiToCaptions}. */
export interface OpenAiToCaptionsOutput {
	captions: Caption[];
}

// Characters that may surround a word in the text: ASCII punctuation (without the backslash) and
// the typographic single quotes, as the published function accepts them (__oracle__).
const PUNCTUATION = "!\"#$%&'()*+,\\-./:;<=>?@\\[\\]^_`{|}~‘’";
const APOSTROPHES = /['‘’]/g;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");

/** A pattern for `word` at the start of the rest of the text, with what surrounds it. */
function wordPattern(word: string): RegExp {
	// Straight and typographic apostrophes match one another.
	const body = word.split(APOSTROPHES).map(escapeRegExp).join("['‘’]");
	return new RegExp(`^[\\s${PUNCTUATION}]{0,4}${body}[${PUNCTUATION}]{0,3}`);
}

/**
 * Turns the `verbose_json` result of OpenAI's transcription API into captions. With timed `words`
 * (`timestamp_granularities: ["word"]`), each word becomes a caption carrying the punctuation and
 * spacing around it in `text`; without words, each timed segment becomes one caption. Runs
 * locally: it never calls OpenAI. Throws an Error naming the first invalid field, or when a word
 * cannot be found in the text.
 */
export function openAiWhisperApiToCaptions(input: OpenAiToCaptionsInput): OpenAiToCaptionsOutput {
	const { transcription } = input;
	validateTranscription(transcription);
	const { text, words, segments } = transcription;
	if (words && words.length > 0) {
		let rest = text;
		const captions = words.map((w): Caption => {
			const match = wordPattern(w.word).exec(rest);
			if (!match) {
				throw new Error(
					`openAiWhisperApiToCaptions(): the word ${JSON.stringify(w.word)} is not where the text continues (${JSON.stringify(rest)}). The words must appear in the text in order, with at most a few spaces or punctuation marks between them.`,
				);
			}
			rest = rest.slice(match[0].length);
			// Key order as the published function returns it.
			return {
				confidence: null,
				endMs: w.end * 1000,
				startMs: w.start * 1000,
				text: match[0],
				timestampMs: ((w.start + w.end) / 2) * 1000,
			};
		});
		return { captions };
	}
	if (segments && segments.length > 0) {
		return {
			captions: segments.map((s) => ({
				text: s.text,
				startMs: s.start * 1000,
				endMs: s.end * 1000,
				timestampMs: (s.start * 1000 + s.end * 1000) / 2,
				confidence: null,
			})),
		};
	}
	throw new Error(
		'openAiWhisperApiToCaptions(): the transcription has no timed words or segments. Request response_format: "verbose_json" with timestamp_granularities: ["word"] (or segments).',
	);
}
