import { type DecodedGif, decodeGif } from "./decode.js";

/** Options for loading a GIF. */
export interface GifLoadOptions {
	/** Passed to `fetch()`; its `signal` is replaced by the loader's own. */
	requestInit?: RequestInit;
}

/**
 * Fetches and decodes a GIF. The response must be served as `image/gif`, as the published
 * @remotion/gif requires: any other content type, including the type of an error page, rejects
 * with an `Error` naming the URL and the type served.
 */
export async function fetchGif(
	src: string,
	options: GifLoadOptions = {},
	signal?: AbortSignal,
): Promise<DecodedGif> {
	const response = await fetch(src, { ...options.requestInit, signal: signal ?? null });
	const type = response.headers.get("content-type");
	if (type !== "image/gif") {
		throw new Error(
			`${src} is served ${type === null ? "without a content type" : `as "${type}"`}, not as image/gif: GIFs must be served with the content type image/gif.`,
		);
	}
	return decodeGif(await response.arrayBuffer());
}

interface Entry {
	promise: Promise<DecodedGif>;
	controller: AbortController;
	users: number;
}

const cache = new Map<string, Entry>();

/**
 * A shared, reference-counted load of `src`: components and `preloadGif()` showing the same GIF
 * decode it once. `release()` drops the reference; the last one aborts a pending download and
 * frees the frames.
 */
export function acquireGif(
	src: string,
	options: GifLoadOptions = {},
): { promise: Promise<DecodedGif>; release: () => void } {
	let entry = cache.get(src);
	if (!entry) {
		const controller = new AbortController();
		const created: Entry = {
			controller,
			users: 0,
			promise: fetchGif(src, options, controller.signal),
		};
		// A failed load is not kept: the next user retries.
		created.promise.catch(() => {
			if (cache.get(src) === created) cache.delete(src);
		});
		cache.set(src, created);
		entry = created;
	}
	const held = entry;
	held.users++;
	let released = false;
	return {
		promise: held.promise,
		release: () => {
			if (released) return;
			released = true;
			held.users--;
			if (held.users === 0 && cache.get(src) === held) {
				cache.delete(src);
				held.controller.abort();
			}
		},
	};
}
