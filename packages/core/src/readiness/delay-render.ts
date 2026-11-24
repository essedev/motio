import { useMemo } from "react";
import { readiness } from "./registry.js";

/** Options of `delayRender()`. */
export interface DelayRenderOptions {
	/** Timeout of this handle in milliseconds; defaults to the render's timeout (30 s). */
	timeoutInMilliseconds?: number;
	/** How many times the frame is retried on a fresh page if this handle times out. */
	retries?: number;
}

function validateOptions(options: DelayRenderOptions | undefined): void {
	if (options === undefined) return;
	if (options === null || typeof options !== "object") {
		throw new TypeError(
			`The second argument of delayRender() must be an options object, got ${String(options)}`,
		);
	}
	const { timeoutInMilliseconds, retries } = options;
	if (
		timeoutInMilliseconds !== undefined &&
		(typeof timeoutInMilliseconds !== "number" ||
			!Number.isFinite(timeoutInMilliseconds) ||
			timeoutInMilliseconds <= 0)
	) {
		throw new TypeError(
			`delayRender(): "timeoutInMilliseconds" must be a positive number, got ${String(timeoutInMilliseconds)}`,
		);
	}
	if (
		retries !== undefined &&
		(typeof retries !== "number" || !Number.isInteger(retries) || retries < 0)
	) {
		throw new TypeError(
			`delayRender(): "retries" must be a non-negative integer, got ${String(retries)}`,
		);
	}
}

/**
 * Blocks the capture of the current frame until `continueRender(handle)` is called. The handle
 * times out after `timeoutInMilliseconds` (default 30 s, real time), which fails the frame with
 * the label. Has no effect in the Player.
 *
 * Needed for anything a frame shows after an asynchronous step that Motio does not wait for on
 * its own: data fetched in an effect or by a query hook, a file decoded by hand, a chart drawn
 * later. Without it the screenshot is taken whenever the page looks idle, so the frame shows the
 * loading state on some renders and the data on others.
 */
export function delayRender(label?: string, options?: DelayRenderOptions): number {
	if (label !== undefined && typeof label !== "string") {
		throw new TypeError(
			`The label passed to delayRender() must be a string or undefined, got ${typeof label}`,
		);
	}
	validateOptions(options);
	return readiness.add(label ?? null, options?.timeoutInMilliseconds, options?.retries ?? 0);
}

/**
 * Releases a handle returned by `delayRender()`. Calling it again with the same handle has no
 * effect.
 */
export function continueRender(handle: number): void {
	if (typeof handle !== "number" || !Number.isFinite(handle)) {
		throw new TypeError(
			`continueRender() expects the handle returned by delayRender(), a number; got ${typeof handle}`,
		);
	}
	readiness.remove(handle);
}

/**
 * Fails the render with the given error, without retries, and releases every open handle. Throws
 * the error, so code after the call does not run.
 */
export function cancelRender(err: unknown): never {
	const error =
		err instanceof Error
			? err
			: new Error(typeof err === "string" ? err : `cancelRender() was called with ${String(err)}`);
	readiness.cancel(error);
	throw error;
}

/** The functions returned by `useDelayRender()`. */
export interface ScopedDelayRender {
	delayRender: typeof delayRender;
	continueRender: typeof continueRender;
	cancelRender: typeof cancelRender;
}

/**
 * `delayRender()`, `continueRender()` and `cancelRender()` scoped to the calling component's
 * render. In a single-page render the scope is the page.
 */
export function useDelayRender(): ScopedDelayRender {
	return useMemo(() => ({ delayRender, continueRender, cancelRender }), []);
}
