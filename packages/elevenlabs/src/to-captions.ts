import type { Caption } from "@motiojs/captions";
import { detectElevenLabsTranscriptFormat } from "./detect.js";
import type {
	ElevenLabsSegment,
	ElevenLabsSegmentWord,
	ElevenLabsTranscript,
	ElevenLabsWord,
} from "./types.js";

/** Input of {@link elevenLabsTranscriptToCaptions}. */
export interface ElevenLabsTranscriptToCaptionsInput {
	transcript: ElevenLabsTranscript;
}

/** Output of {@link elevenLabsTranscriptToCaptions}. */
export interface ElevenLabsTranscriptToCaptionsOutput {
	captions: Caption[];
}

const describe = (value: unknown) =>
	value === undefined
		? "missing"
		: Array.isArray(value)
			? "an array"
			: (JSON.stringify(value) ?? String(value));

const fail = (path: string, problem: string): never => {
	throw new Error(`elevenLabsTranscriptToCaptions(): ${path} ${problem}.`);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const WORD_TYPES = ["word", "spacing", "audio_event"];

function checkString(path: string, value: unknown): void {
	if (typeof value !== "string") fail(path, `is ${describe(value)}: pass a string`);
}

function checkTime(path: string, value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		fail(path, `is ${describe(value)}: pass a finite, non-negative number of seconds`);
	}
	return value as number;
}

function checkSpan(path: string, entry: Record<string, unknown>, startKey: string, endKey: string) {
	const start = checkTime(`${path}.${startKey}`, entry[startKey]);
	const end = checkTime(`${path}.${endKey}`, entry[endKey]);
	if (end < start) fail(`${path}.${endKey}`, `(${end}) is earlier than ${startKey} (${start})`);
}

function checkArray(path: string, value: unknown): unknown[] {
	if (!Array.isArray(value)) fail(path, `is ${describe(value)}: pass an array`);
	return value as unknown[];
}

function checkEntry(path: string, value: unknown): Record<string, unknown> {
	if (!isRecord(value)) fail(path, `is ${describe(value)}: pass an object`);
	return value as Record<string, unknown>;
}

function speechToTextCaptions(transcript: Record<string, unknown>): Caption[] {
	const words = checkArray("words", transcript.words);
	words.forEach((value, i) => {
		const word = checkEntry(`words[${i}]`, value);
		checkString(`words[${i}].text`, word.text);
		if (typeof word.type !== "string" || !WORD_TYPES.includes(word.type)) {
			fail(`words[${i}].type`, `is ${describe(word.type)}: use "word", "spacing" or "audio_event"`);
		}
		checkSpan(`words[${i}]`, word, "start", "end");
	});
	const captions: Caption[] = [];
	// A word right after spacings starts where the last of them started; an audio event in between
	// cancels that, and is not a caption itself.
	let spacingStart: number | null = null;
	for (const word of words as ElevenLabsWord[]) {
		if (word.type === "spacing") {
			spacingStart = word.start;
			continue;
		}
		if (word.type === "audio_event") {
			spacingStart = null;
			continue;
		}
		const first = captions.length === 0;
		const start = !first && spacingStart !== null ? spacingStart : word.start;
		spacingStart = null;
		// Key order as the published function returns it.
		captions.push({
			confidence: null,
			startMs: start * 1000,
			endMs: word.end * 1000,
			text: first ? word.text : ` ${word.text}`,
			timestampMs: (start * 1000 + word.end * 1000) / 2,
		});
	}
	return captions;
}

const timed = (text: string, start: number, end: number): Caption => ({
	text,
	startMs: start * 1000,
	endMs: end * 1000,
	timestampMs: (start * 1000 + end * 1000) / 2,
	confidence: null,
});

function segmentedCaptions(transcript: Record<string, unknown>): Caption[] {
	const segments = checkArray("segments", transcript.segments);
	segments.forEach((value, i) => {
		const segment = checkEntry(`segments[${i}]`, value);
		checkString(`segments[${i}].text`, segment.text);
		checkSpan(`segments[${i}]`, segment, "start_time", "end_time");
		if (segment.words === undefined) return;
		checkArray(`segments[${i}].words`, segment.words).forEach((w, j) => {
			const word = checkEntry(`segments[${i}].words[${j}]`, w);
			checkString(`segments[${i}].words[${j}].text`, word.text);
			checkSpan(`segments[${i}].words[${j}]`, word, "start_time", "end_time");
		});
	});
	return (segments as ElevenLabsSegment[]).flatMap((segment) =>
		segment.words && segment.words.length > 0
			? segment.words.map((w: ElevenLabsSegmentWord) => timed(w.text, w.start_time, w.end_time))
			: [timed(segment.text, segment.start_time, segment.end_time)],
	);
}

/**
 * Turns an ElevenLabs Speech to Text response (requested with `timestamps_granularity: "word"`)
 * or a JSON transcript exported from ElevenLabs into captions. In a response, each `word` entry
 * becomes a caption, audio events are skipped and spacings move the next word's start to the
 * last of them; in an export, each segment becomes a caption, or each of its words when it has some. Runs
 * locally: it never calls ElevenLabs. Throws an Error naming the first invalid field.
 */
export function elevenLabsTranscriptToCaptions(
	input: ElevenLabsTranscriptToCaptionsInput,
): ElevenLabsTranscriptToCaptionsOutput {
	const { transcript } = input;
	const format = detectElevenLabsTranscriptFormat(transcript);
	if (format === null) {
		throw new Error(
			"elevenLabsTranscriptToCaptions(): the transcript is neither a Speech to Text response (language_code and words) nor a JSON export (language_code and segments).",
		);
	}
	const record = transcript as unknown as Record<string, unknown>;
	return {
		captions:
			format === "speech-to-text" ? speechToTextCaptions(record) : segmentedCaptions(record),
	};
}
