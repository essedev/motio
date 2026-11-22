import type { PageError, PageErrorCode } from "../protocol.js";

/** Extra fields of a page error. */
export interface PageErrorExtra {
	frame?: number;
	label?: string;
	retries?: number;
}

/** Builds the serialisable error the page API rejects with. */
export function toPageError(
	code: PageErrorCode,
	err: unknown,
	extra: PageErrorExtra = {},
): PageError {
	const out: PageError = {
		code,
		message: err instanceof Error ? err.message : typeof err === "string" ? err : String(err),
	};
	if (err instanceof Error && err.stack) out.stack = err.stack;
	if (extra.frame !== undefined) out.frame = extra.frame;
	if (extra.label !== undefined) out.label = extra.label;
	if (extra.retries !== undefined) out.retries = extra.retries;
	return out;
}

/** True for objects shaped like a `PageError` (already converted). */
export function isPageError(value: unknown): value is PageError {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as PageError).code === "string" &&
		typeof (value as PageError).message === "string" &&
		!(value instanceof Error)
	);
}
