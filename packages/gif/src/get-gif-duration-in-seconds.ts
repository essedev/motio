import { fetchGif } from "./load.js";

/** Options of `getGifDurationInSeconds()`. */
export interface GetGifDurationInSecondsOptions {
	/** Passed to `fetch()` (headers, credentials); a `signal` has no effect. */
	requestInit?: RequestInit;
}

/**
 * The duration of one playthrough of a GIF in seconds: the sum of its frame delays (a delay of 0
 * counts as 100 ms). Looping is not counted. The GIF must be served as `image/gif` and, from
 * another origin, with CORS.
 */
export async function getGifDurationInSeconds(
	src: string,
	options?: GetGifDurationInSecondsOptions,
): Promise<number> {
	const { requestInit } = options ?? {};
	const { signal: _ignored, ...init } = requestInit ?? {};
	const gif = await fetchGif(src, { requestInit: init });
	return gif.delays.reduce((sum, delay) => sum + delay, 0) / 1000;
}
