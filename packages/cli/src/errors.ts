import { isCodedError, MotioError } from "@motiojs/compat";

/** Process exit codes of the `motio` binary. */
export const EXIT = {
	ok: 0,
	/** A command failed (render error, missing composition...). */
	error: 1,
	/** Invalid arguments or flags. */
	usage: 2,
	/** A check ran and found problems (determinism, flicker, doctor). */
	checkFailed: 3,
} as const;

/** Error for invalid command-line input; exits with code 2. */
export function usageError(message: string, context: Record<string, unknown> = {}): MotioError {
	return new MotioError("E_INVALID_ARGUMENT", message, context);
}

/** The `error` member of a failed JSON result. */
export interface ErrorJson {
	code: string;
	message: string;
	context: Record<string, unknown>;
}

const RENDERER_CONTEXT_KEYS = ["frame", "label", "composition", "pageStack", "details"] as const;

/**
 * Normalises any thrown value to `{ code, message, context }`. Understands the compat
 * `MotioError` (`context`) and the renderer's (`frame`, `label`, `composition`, `details`).
 */
export function toErrorJson(error: unknown): ErrorJson {
	if (isCodedError(error)) {
		const context: Record<string, unknown> = { ...(error.context ?? {}) };
		const record = error as unknown as Record<string, unknown>;
		for (const key of RENDERER_CONTEXT_KEYS) {
			if (record[key] !== undefined) context[key] = record[key];
		}
		return { code: error.code, message: error.message, context };
	}
	if (error instanceof Error) {
		return {
			code: "E_INTERNAL",
			message: error.message,
			context: error.stack ? { stack: error.stack } : {},
		};
	}
	return { code: "E_INTERNAL", message: String(error), context: {} };
}

/** Exit code for an error: 2 for argument errors, 1 otherwise. */
export function exitCodeFor(error: unknown): number {
	return isCodedError(error) && error.code === "E_INVALID_ARGUMENT" ? EXIT.usage : EXIT.error;
}
