import type { OpenAiVerboseTranscription } from "./types.js";

const describe = (value: unknown) =>
	value === undefined
		? "missing"
		: Array.isArray(value)
			? "an array"
			: (JSON.stringify(value) ?? String(value));

const fail = (path: string, problem: string): never => {
	throw new Error(`openAiWhisperApiToCaptions(): ${path} ${problem}.`);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

function checkTime(path: string, value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		fail(path, `is ${describe(value)}: pass a finite, non-negative number of seconds`);
	}
	return value as number;
}

function checkTimed(path: string, entry: unknown, textKey: "word" | "text"): void {
	if (!isRecord(entry)) fail(path, `is ${describe(entry)}: pass an object`);
	const record = entry as Record<string, unknown>;
	if (typeof record[textKey] !== "string") {
		fail(`${path}.${textKey}`, `is ${describe(record[textKey])}: pass a string`);
	}
	const start = checkTime(`${path}.start`, record.start);
	const end = checkTime(`${path}.end`, record.end);
	if (end < start) fail(`${path}.end`, `(${end}) is earlier than start (${start})`);
}

function checkList(path: string, value: unknown, textKey: "word" | "text"): void {
	if (value === undefined) return;
	if (!Array.isArray(value)) fail(path, `is ${describe(value)}: pass an array or leave it out`);
	for (const [i, entry] of (value as unknown[]).entries())
		checkTimed(`${path}[${i}]`, entry, textKey);
}

/** Throws an Error naming the first field of `transcription` that is not valid. */
export function validateTranscription(
	transcription: unknown,
): asserts transcription is OpenAiVerboseTranscription {
	if (!isRecord(transcription)) {
		fail(
			"transcription",
			`is ${describe(transcription)}: pass the verbose_json object the API returns`,
		);
	}
	const record = transcription as Record<string, unknown>;
	if (typeof record.text !== "string") fail("text", `is ${describe(record.text)}: pass a string`);
	checkList("words", record.words, "word");
	// Segments are not used, so not checked, when there are words.
	if (Array.isArray(record.words) && record.words.length > 0) return;
	checkList("segments", record.segments, "text");
}
