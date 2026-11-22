import { MotioError } from "./errors.js";

/** Registers a callback invoked once when the render is cancelled. */
export type CancelSignal = (callback: () => void) => void;

/** A cancel signal and the function that fires it, as returned by `makeCancelSignal()`. */
export interface CancelSignalHandle {
	/** Pass as the `cancelSignal` option of a render function. */
	cancelSignal: CancelSignal;
	/** Cancels every render that received `cancelSignal`. Calling it again does nothing. */
	cancel: () => void;
}

/**
 * Creates a signal that cancels `renderMedia()`, `renderFrames()` or `renderStill()`. A
 * cancelled render rejects with a `MotioError` of code `E_CANCELLED` after closing its browsers
 * and FFmpeg and removing partial output.
 */
export function makeCancelSignal(): CancelSignalHandle {
	const callbacks: (() => void)[] = [];
	let cancelled = false;
	return {
		cancelSignal: (callback) => {
			if (cancelled) queueMicrotask(callback);
			else callbacks.push(callback);
		},
		cancel: () => {
			if (cancelled) return;
			cancelled = true;
			for (const cb of callbacks.splice(0)) cb();
		},
	};
}

/** The error a cancelled render rejects with; `fn` names the public function. */
export function cancelledError(fn: string): MotioError {
	return new MotioError("E_CANCELLED", `${fn}() got cancelled`);
}

/** Bridges a `CancelSignal` to an `AbortController` used internally. */
export function toAbortController(signal: CancelSignal | undefined, fn: string): AbortController {
	const controller = new AbortController();
	signal?.(() => {
		if (!controller.signal.aborted) controller.abort(cancelledError(fn));
	});
	return controller;
}
