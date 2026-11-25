import { readFile } from "node:fs/promises";
import { serializeSrt } from "@motiojs/captions";
import {
	detectElevenLabsTranscriptFormat,
	type ElevenLabsTranscript,
	elevenLabsTranscriptToCaptions,
} from "@motiojs/elevenlabs";

// region: captions
// A Speech to Text response (requested with timestamps_granularity: "word") or a JSON export.
const data: unknown = JSON.parse(await readFile("transcript.json", "utf8"));
if (detectElevenLabsTranscriptFormat(data) === null) {
	throw new Error("transcript.json is not an ElevenLabs transcript");
}
// One caption per word, times in milliseconds; no request is made to ElevenLabs.
const { captions } = elevenLabsTranscriptToCaptions({ transcript: data as ElevenLabsTranscript });
const srt = serializeSrt({ lines: captions.map((caption) => [caption]) });
// endregion

export const all = [srt];
