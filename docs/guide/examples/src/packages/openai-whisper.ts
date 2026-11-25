import { readFile } from "node:fs/promises";
import { serializeSrt } from "@motiojs/captions";
import {
	isOpenAiWhisperTranscript,
	type OpenAiVerboseTranscription,
	openAiWhisperApiToCaptions,
} from "@motiojs/openai-whisper";

// region: captions
// The verbose_json result of OpenAI's transcription API, saved as JSON; with
// timestamp_granularities: ["word"] every word becomes a caption.
const data: unknown = JSON.parse(await readFile("transcription.json", "utf8"));
if (!isOpenAiWhisperTranscript(data)) {
	throw new Error("transcription.json is not a verbose_json transcription");
}
// Runs locally: no request is made to OpenAI.
const { captions } = openAiWhisperApiToCaptions({
	transcription: data as OpenAiVerboseTranscription,
});
const srt = serializeSrt({ lines: captions.map((caption) => [caption]) });
// endregion

export const all = [srt];
