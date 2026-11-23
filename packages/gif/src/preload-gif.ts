import { acquireGif } from "./load.js";

/** Options of `preloadGif()`. */
export interface PreloadGifOptions {
	/** Passed to `fetch()` (headers, credentials); a `signal` has no effect. */
	requestInit?: RequestInit;
}

/** What `preloadGif()` returns. */
export interface PreloadGifResult {
	/** Resolves once the GIF is downloaded and decoded. */
	waitUntilDone: () => Promise<void>;
	/** Cancels the preload, or frees the decoded frames once no `<Gif>` shows them. */
	free: () => void;
}

/**
 * Downloads and decodes a GIF ahead of time, so a `<Gif>` with the same `src` shows it without
 * waiting (useful in the Player).
 */
export function preloadGif(src: string, options?: PreloadGifOptions): PreloadGifResult {
	const { signal: _ignored, ...init } = options?.requestInit ?? {};
	const { promise, release } = acquireGif(src, { requestInit: init });
	// A failed preload surfaces through waitUntilDone(), not as an unhandled rejection.
	promise.catch(() => {});
	return {
		waitUntilDone: () => promise.then(() => undefined),
		free: release,
	};
}
