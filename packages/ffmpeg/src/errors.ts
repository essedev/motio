/** Stable error codes of `@motiojs/ffmpeg`. Never renamed once released. */
export type FfmpegErrorCode =
	| "E_FFMPEG_UNSUPPORTED_PLATFORM"
	| "E_FFMPEG_DOWNLOAD"
	| "E_FFMPEG_DIGEST"
	| "E_FFMPEG_VERIFY";

/** Every error this package throws: a stable `code`, a message that says what to do, details. */
export class FfmpegError extends Error {
	readonly code: FfmpegErrorCode;
	readonly details: Record<string, unknown>;

	constructor(
		code: FfmpegErrorCode,
		message: string,
		details: Record<string, unknown> = {},
		cause?: unknown,
	) {
		super(message, cause === undefined ? undefined : { cause });
		this.name = "MotioError";
		this.code = code;
		this.details = details;
	}
}
