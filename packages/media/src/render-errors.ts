import { cancelRender } from "@motiojs/core";

/**
 * Fails the render with `error`. `cancelRender()` throws by contract; called from a promise or
 * event callback, that throw would only become an unhandled rejection, while the cancellation
 * itself is already recorded and fails the frame.
 */
export function failRender(error: unknown): void {
	try {
		cancelRender(error);
	} catch {
		// See above: the readiness registry carries the cancellation to the renderer.
	}
}

/** Converts anything thrown or rejected to an `Error`. */
export function toError(value: unknown): Error {
	return value instanceof Error ? value : new Error(String(value));
}

/** Merges a forwarded ref with a local callback ref. */
export function assignRef<T>(
	ref: ((instance: T | null) => void) | { current: T | null } | null | undefined,
	value: T | null,
): void {
	if (typeof ref === "function") ref(value);
	else if (ref) ref.current = value;
}
