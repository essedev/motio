/**
 * Whether `input` looks like an OpenAI Whisper `verbose_json` transcription: an object with a
 * `task` field, or with `text` and either `words` and `language`, or `segments` and `language` or
 * `duration`. Only the
 * keys are looked at, so a malformed transcription can be recognized; never throws. Validate and
 * convert it with `openAiWhisperApiToCaptions()`.
 */
export function isOpenAiWhisperTranscript(input: unknown): boolean {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
	if ("task" in input) return true;
	if (!("text" in input)) return false;
	if ("words" in input && "language" in input) return true;
	return "segments" in input && ("language" in input || "duration" in input);
}
