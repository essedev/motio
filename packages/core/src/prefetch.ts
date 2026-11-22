import { getRemotionEnvironment } from "./environment.js";

/** Progress reported by `prefetch()`. */
export interface PrefetchProgress {
	loadedBytes: number;
	/** Null when the response has no `Content-Length`. */
	totalBytes: number | null;
}

export type PrefetchOnProgress = (progress: PrefetchProgress) => void;

/** Options of `prefetch()`. */
export interface PrefetchOptions {
	/** `"blob-url"` (default) or `"base64"`. */
	method?: "blob-url" | "base64";
	/** MIME type for the blob; defaults to the response's content type. */
	contentType?: string;
	credentials?: RequestCredentials;
	onProgress?: PrefetchOnProgress;
	logLevel?: "trace" | "verbose" | "info" | "warn" | "error";
}

/** What `prefetch()` returns. */
export interface PrefetchResult {
	/** Aborts the download if in progress and frees the memory. */
	free: () => void;
	/** Resolves with the blob or data URL, or with `src` itself when rendering. */
	waitUntilDone: () => Promise<string>;
}

interface Entry {
	url: string;
	revoke: (() => void) | null;
	owners: number;
}

const completed = new Map<string, Entry>();

/** The prefetched URL for `src`, if a completed prefetch holds it. Used by media components. */
export function getPrefetchedUrl(src: string): string | null {
	return completed.get(src)?.url ?? null;
}

async function readBody(
	response: Response,
	onProgress: PrefetchOnProgress | undefined,
): Promise<Blob> {
	const header = response.headers.get("content-length");
	const totalBytes = header === null ? null : Number(header);
	if (!onProgress || !response.body) return response.blob();
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let loadedBytes = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		loadedBytes += value.byteLength;
		onProgress({ loadedBytes, totalBytes });
	}
	return new Blob(chunks as BlobPart[], {
		type: response.headers.get("content-type") ?? "",
	});
}

function toBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

/**
 * Downloads an asset ahead of time so a Player shows it without loading. Media components given
 * the original URL use the prefetched copy. A no-op while rendering.
 */
export function prefetch(src: string, options: PrefetchOptions = {}): PrefetchResult {
	if (typeof src !== "string")
		throw new TypeError(`prefetch() expects a URL string, got ${typeof src}.`);
	if (getRemotionEnvironment().isRendering) {
		return { free: () => {}, waitUntilDone: () => Promise.resolve(src) };
	}
	const controller = new AbortController();
	let freed = false;
	let owned: Entry | null = null;
	const done = (async () => {
		const init: RequestInit = { signal: controller.signal };
		if (options.credentials !== undefined) init.credentials = options.credentials;
		const response = await fetch(src, init);
		if (!response.ok) throw new Error(`prefetch(): ${src} returned HTTP ${response.status}.`);
		let blob = await readBody(response, options.onProgress);
		if (options.contentType) blob = new Blob([blob], { type: options.contentType });
		const existing = completed.get(src);
		if (existing) {
			existing.owners++;
			owned = existing;
			return existing.url;
		}
		const entry: Entry =
			options.method === "base64"
				? { url: await toBase64(blob), revoke: null, owners: 1 }
				: (() => {
						const url = URL.createObjectURL(blob);
						return { url, revoke: () => URL.revokeObjectURL(url), owners: 1 };
					})();
		if (freed) {
			entry.revoke?.();
			throw new Error(`prefetch(): ${src} was freed before it finished.`);
		}
		completed.set(src, entry);
		owned = entry;
		return entry.url;
	})();
	// Callers observe failures through waitUntilDone(); a freed prefetch is not an unhandled error.
	done.catch(() => {});
	return {
		free: () => {
			if (freed) return;
			freed = true;
			controller.abort();
			const entry = owned as Entry | null;
			if (entry && --entry.owners === 0) {
				entry.revoke?.();
				completed.delete(src);
			}
		},
		waitUntilDone: () => done,
	};
}
