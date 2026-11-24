import { isAssetError } from "../asset-error.js";
import type { PageError, PageErrorCode } from "../protocol.js";

/** Extra fields of a page error. */
export interface PageErrorExtra {
	frame?: number;
	label?: string;
	retries?: number;
	timeoutMs?: number;
	details?: Record<string, unknown>;
}

/** Codes an asset error replaces: the generic ones a cancellation or a render error carries. */
const GENERIC_CODES = new Set<PageErrorCode>([
	"E_CANCELLED",
	"E_RENDER_ERROR",
	"E_INVALID_COMPOSITION",
]);

/**
 * Builds the serialisable error the page API rejects with. An `AssetError` (a missing file, a
 * font that failed to load) keeps its own code and details instead of the generic `code`.
 */
export function toPageError(
	code: PageErrorCode,
	err: unknown,
	extra: PageErrorExtra = {},
): PageError {
	const asset = isAssetError(err) && GENERIC_CODES.has(code);
	const out: PageError = {
		code: asset ? (err as { code: PageErrorCode }).code : code,
		message: err instanceof Error ? err.message : typeof err === "string" ? err : String(err),
	};
	if (err instanceof Error && err.stack) out.stack = err.stack;
	if (extra.frame !== undefined) out.frame = extra.frame;
	if (extra.label !== undefined) out.label = extra.label;
	if (extra.retries !== undefined) out.retries = extra.retries;
	if (extra.timeoutMs !== undefined) out.timeoutMs = extra.timeoutMs;
	const details = {
		...(asset ? (err as { details?: Record<string, unknown> }).details : undefined),
		...extra.details,
	};
	if (Object.keys(details).length > 0) out.details = toJson(details);
	return out;
}

/** Keeps only what survives `JSON.stringify`, since page errors cross the page boundary. */
function toJson(value: Record<string, unknown>): Record<string, unknown> {
	try {
		return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
	} catch (err) {
		return { unserialisable: err instanceof Error ? err.message : String(err) };
	}
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
