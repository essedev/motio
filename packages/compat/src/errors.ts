/**
 * Error with a stable code and structured context, as required by docs/CONVENTIONS.md.
 *
 * Lives here until a shared `MotioError` is exported by a lower-level package; the shape
 * (`code`, `message`, `context`) is the same, so consumers can match on `code` alone.
 */
export class MotioError extends Error {
	/** Stable machine-readable code, e.g. `E_UNSUPPORTED_PACKAGE`. */
	readonly code: string;
	/** Structured details: package, symbol, file, option... */
	readonly context: Record<string, unknown>;

	constructor(
		code: string,
		message: string,
		context: Record<string, unknown> = {},
		options?: { cause?: unknown },
	) {
		super(message, options);
		this.name = "MotioError";
		this.code = code;
		this.context = context;
	}
}

/** True for any error carrying a string `code`, including `MotioError` from other packages. */
export function isCodedError(
	error: unknown,
): error is Error & { code: string; context?: Record<string, unknown> } {
	return error instanceof Error && typeof (error as { code?: unknown }).code === "string";
}
