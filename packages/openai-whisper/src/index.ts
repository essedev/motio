/**
 * `@motiojs/openai-whisper`, the equivalent of `@remotion/openai-whisper`: turns transcriptions of
 * OpenAI's Whisper API into captions, locally.
 */
export { isOpenAiWhisperTranscript } from "./is-transcript.js";
export {
	type OpenAiToCaptionsInput,
	type OpenAiToCaptionsOutput,
	openAiWhisperApiToCaptions,
} from "./to-captions.js";
export type {
	OpenAiVerboseTranscription,
	OpenAiWhisperSegment,
	OpenAiWhisperWord,
} from "./types.js";
