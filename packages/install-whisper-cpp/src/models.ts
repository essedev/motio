/** The Whisper models whisper.cpp publishes. */
export const WHISPER_MODELS = [
	"tiny",
	"tiny.en",
	"base",
	"base.en",
	"small",
	"small.en",
	"medium",
	"medium.en",
	"large-v1",
	"large-v2",
	"large-v3",
	"large-v3-turbo",
] as const;

/** A Whisper model name, such as `"medium.en"`. */
export type WhisperModel = (typeof WHISPER_MODELS)[number];

/** File name of a model inside its folder. */
export const modelFileName = (model: string) => `ggml-${model}.bin`;

/** Where a model is downloaded from: the ggml conversions published with whisper.cpp. */
export const modelUrl = (model: string) =>
	`https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${modelFileName(model)}`;

/** Throws when `model` is not one of {@link WHISPER_MODELS}. */
export function assertWhisperModel(model: unknown): asserts model is WhisperModel {
	if (!(WHISPER_MODELS as readonly unknown[]).includes(model)) {
		throw new Error(
			`${JSON.stringify(model)} is not a Whisper model; use one of ${WHISPER_MODELS.join(", ")}.`,
		);
	}
}
