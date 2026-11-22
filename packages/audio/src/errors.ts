/** Error codes raised by the audio mixer. */
export type AudioErrorCode = "E_AUDIO_DECODE" | "E_AUDIO_ENCODE" | "E_AUDIO_INVALID_SOURCE";

/** An audio mixer failure with a stable code and the source or output it concerns. */
export class AudioError extends Error {
	readonly code: AudioErrorCode;
	readonly context: Record<string, unknown>;

	constructor(code: AudioErrorCode, message: string, context: Record<string, unknown> = {}) {
		super(message);
		this.name = "AudioError";
		this.code = code;
		this.context = context;
	}
}
