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
	| "E_ASSET_NOT_FOUND"
	| "E_FONT_LOAD"
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
	| "E_NO_AUDIO_STREAM"
	| "E_BROWSER_CLOSED";

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
	/** Free-form details (FFmpeg stderr, versions, paths); see `MotioError.details`. */
	details?: Record<string, unknown>;
}

/** Where in the project's source an error from the page happened, mapped through source maps. */
export interface SourceLocation {
	/** Absolute path of the source file when the bundle was built locally, else its URL. */
	file: string;
	/** 1-based line. */
	line: number;
	/** 1-based column. */
	column: number;
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
	/**
	 * Structured details. Besides the code's own fields (FFmpeg stderr, versions, paths), it
	 * repeats `frame` and `compositionId` when they are known, and may carry `source` (a
	 * `SourceLocation` in the project's code), `hint` (what to do, in a sentence), `option` (the
	 * Node API option an invalid value was given to) and, for page errors, `rawStack` (the stack
	 * before source mapping).
	 */
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
		this.details = withLocation(context);
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

/** The details of a context, with `frame` and `compositionId` added when known. */
function withLocation(context: MotioErrorContext): Record<string, unknown> | undefined {
	const extra: Record<string, unknown> = {};
	if (context.frame !== undefined) extra.frame = context.frame;
	if (context.composition !== undefined) extra.compositionId = context.composition;
	if (Object.keys(extra).length === 0) return context.details;
	return { ...extra, ...context.details };
}

/** True if `err` is a `MotioError`, optionally with the given code. */
export function isMotioError(err: unknown, code?: MotioErrorCode): err is MotioError {
	return err instanceof MotioError && (code === undefined || err.code === code);
}
