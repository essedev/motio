/**
 * `@motiojs/install-whisper-cpp`, the equivalent of `@remotion/install-whisper-cpp`: installs
 * whisper.cpp and its models, transcribes audio locally and turns the result into captions.
 */
export { convertToCaptions } from "./convert-to-captions.js";
export {
	type DownloadWhisperModelOptions,
	type DownloadWhisperModelResult,
	downloadWhisperModel,
	type OnProgress,
} from "./download.js";
export {
	type InstallWhisperCppOptions,
	type InstallWhisperCppResult,
	installWhisperCpp,
} from "./install.js";
export { WHISPER_MODELS, type WhisperModel } from "./models.js";
export { type ToCaptionsInput, type ToCaptionsOutput, toCaptions } from "./to-captions.js";
export {
	type AdditionalArgs,
	type TranscribeOnProgress,
	type TranscribeOptions,
	transcribe,
} from "./transcribe.js";
export type {
	Model,
	Offsets,
	Params,
	Result,
	Timestamps,
	TranscriptionItem,
	TranscriptionItemWithTimestamp,
	TranscriptionJson,
	WordLevelToken,
} from "./types.js";
