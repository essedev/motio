async function httpStatus(src: string): Promise<number | null> {
	try {
		const response = await fetch(src, { method: "HEAD" });
		return response.status;
	} catch {
		// The status is only used to word the error message; a failed probe leaves it unknown.
		return null;
	}
}

async function describeError(fn: string, src: string, element: HTMLMediaElement): Promise<Error> {
	const status = await httpStatus(src);
	if (status !== null && status >= 400) {
		return new Error(
			`${fn}() could not load "${src}": the server answered HTTP ${status}. Check the URL of the file.`,
		);
	}
	const browserMessage = element.error?.message ? `, "${element.error.message}"` : "";
	return new Error(
		`${fn}() could not read "${src}" as media (HTTP status ${status ?? "unknown"}; browser error ${element.error?.code ?? "unknown"}${browserMessage}). Check that the file exists and is in a format this browser plays; Mediabunny (https://mediabunny.dev) reads more formats.`,
	);
}

/**
 * Loads the metadata of `src` into a detached `<audio>` or `<video>` element. Rejects with a
 * message naming `fn` and the HTTP status when the browser cannot load the file.
 */
export function loadMediaMetadata<K extends "audio" | "video">(
	kind: K,
	src: string,
	fn: string,
): Promise<HTMLElementTagNameMap[K]> {
	const element = document.createElement(kind);
	return new Promise((resolve, reject) => {
		const onLoaded = () => {
			element.removeEventListener("error", onError);
			resolve(element);
		};
		const onError = () => {
			element.removeEventListener("loadedmetadata", onLoaded);
			describeError(fn, src, element).then(reject, reject);
		};
		element.addEventListener("loadedmetadata", onLoaded, { once: true });
		element.addEventListener("error", onError, { once: true });
		element.preload = "metadata";
		element.src = src;
	});
}

/** Memoizes an async function of a source URL; rejected loads are evicted. */
export function memoizeBySrc<T>(fn: (src: string) => Promise<T>): (src: string) => Promise<T> {
	const cache = new Map<string, Promise<T>>();
	return (src) => {
		const cached = cache.get(src);
		if (cached) return cached;
		const pending = fn(src);
		cache.set(src, pending);
		pending.catch(() => {
			if (cache.get(src) === pending) cache.delete(src);
		});
		return pending;
	};
}
