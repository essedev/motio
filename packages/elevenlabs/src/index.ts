/**
 * `@motiojs/elevenlabs`, the equivalent of `@remotion/elevenlabs`: turns ElevenLabs Speech to
 * Text transcripts into captions, locally.
 */
export { detectElevenLabsTranscriptFormat } from "./detect.js";
export {
	type ElevenLabsTranscriptToCaptionsInput,
	type ElevenLabsTranscriptToCaptionsOutput,
	elevenLabsTranscriptToCaptions,
} from "./to-captions.js";
export type {
	ElevenLabsSegment,
	ElevenLabsSegmentedTranscript,
	ElevenLabsSegmentWord,
	ElevenLabsSpeechToTextTranscript,
	ElevenLabsTranscript,
	ElevenLabsTranscriptFormat,
	ElevenLabsWord,
} from "./types.js";
