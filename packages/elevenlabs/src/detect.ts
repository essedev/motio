import type { ElevenLabsTranscriptFormat } from "./types.js";

/**
 * Which ElevenLabs transcript format `input` looks like: `"speech-to-text"` for an object with
 * `language_code` and `words`, `"segmented"` for one with `language_code` and `segments`, else
 * `null`. Only the keys are looked at, so malformed data can be recognized; never throws.
 */
export function detectElevenLabsTranscriptFormat(
	input: unknown,
): ElevenLabsTranscriptFormat | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	if (!("language_code" in input)) return null;
	if ("words" in input) return "speech-to-text";
	if ("segments" in input) return "segmented";
	return null;
}
