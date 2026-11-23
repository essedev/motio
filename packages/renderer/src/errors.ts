/** Stable error codes raised by the renderer. Never renamed once released. */
export type MotioErrorCode =
	| "E_INVALID_OPTION"
	| "E_UNSUPPORTED_CODEC"
	| "E_ODD_DIMENSIONS"
	| "E_OUTPUT_EXISTS"
	| "E_SERVE_URL"
	| "E_BROWSER_UNSUPPORTED_PLATFORM"
	| "E_BROWSER_DOWNLOAD"
	| "E_BROWSER_CHECKSUM"
	| "E_BROWSER_LAUNCH"
	| "E_BROWSER_CRASHED"
	| "E_PAGE_API_MISSING"
	| "E_PROTOCOL_MISMATCH"
	| "E_COMPOSITION_NOT_FOUND"
	| "E_CALCULATE_METADATA"
	| "E_INVALID_COMPOSITION"
	| "E_READINESS_TIMEOUT"
	| "E_SEEK_TIMEOUT"
	| "E_RENDER_ERROR"
	| "E_PAGE_ERROR"
	| "E_FRAME_MISMATCH"
	| "E_CAPTURE_FAILED"
	| "E_BEGIN_FRAME_UNSUPPORTED"
	| "E_CANCELLED"
	| "E_FFMPEG_NOT_FOUND"
	| "E_FFMPEG_VERSION"
	| "E_FFMPEG_ENCODER_MISSING"
	| "E_FFMPEG_FAILED"
	| "E_MEDIA_SOURCE"
	| "E_AUDIO_FAILED"
	| "E_NO_VIDEO_STREAM"
	| "E_NO_AUDIO_STREAM";

/** Structured context attached to an error. */
export interface MotioErrorContext {
	/** Composition frame the error happened on. */
	frame?: number;
	/** Readiness handle label, for timeouts. */
	label?: string;
	/** Composition id. */
	composition?: string;
	/** Stack trace from the page, when the error came from user code. */
	pageStack?: string;
	/** Free-form details (FFmpeg stderr, versions, paths). */
	details?: Record<string, unknown>;
}

/**
 * Every error the renderer surfaces to users: a stable `code`, a message that says what to do,
 * and structured context.
 */
export class MotioError extends Error {
	readonly code: MotioErrorCode;
	readonly frame: number | undefined;
	readonly label: string | undefined;
	readonly composition: string | undefined;
	readonly pageStack: string | undefined;
	readonly details: Record<string, unknown> | undefined;

	constructor(
		code: MotioErrorCode,
		message: string,
		context: MotioErrorContext = {},
		cause?: unknown,
	) {
		super(message, cause === undefined ? undefined : { cause });
		this.name = "MotioError";
		this.code = code;
		this.frame = context.frame;
		this.label = context.label;
		this.composition = context.composition;
		this.pageStack = context.pageStack;
		this.details = context.details;
	}

	/** A copy with more context, keeping code, message and cause. */
	withContext(context: MotioErrorContext): MotioError {
		const merged = new MotioError(
			this.code,
			this.message,
			{
				...this.contextObject(),
				...context,
			},
			this.cause,
		);
		if (this.stack) merged.stack = this.stack;
		return merged;
	}

	private contextObject(): MotioErrorContext {
		const c: MotioErrorContext = {};
		if (this.frame !== undefined) c.frame = this.frame;
		if (this.label !== undefined) c.label = this.label;
		if (this.composition !== undefined) c.composition = this.composition;
		if (this.pageStack !== undefined) c.pageStack = this.pageStack;
		if (this.details !== undefined) c.details = this.details;
		return c;
	}
}

/** True if `err` is a `MotioError`, optionally with the given code. */
export function isMotioError(err: unknown, code?: MotioErrorCode): err is MotioError {
	return err instanceof MotioError && (code === undefined || err.code === code);
}
