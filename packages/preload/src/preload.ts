/** Options of the preload functions (a Motio addition: Remotion's take only the URL). */
export interface PreloadOptions {
	/**
	 * Called once the browser holds enough of the asset to show it: for media, when it could play
	 * through (`canplaythrough`); for images and fonts, when the preload finished. Called right away
	 * (in a microtask) if the asset is already preloaded.
	 */
	onReady?: () => void;
	/** Called if the asset cannot be loaded. Without it, a warning is logged. */
	onError?: (error: Error) => void;
}

type Kind = "video" | "audio" | "image" | "font";

interface Entry {
	element: HTMLElement;
	users: number;
	state: "loading" | "ready" | "failed";
	error: Error | null;
	waiters: Set<Required<Pick<PreloadOptions, "onReady">> & PreloadOptions>;
}

const NAMES: Record<Kind, string> = {
	video: "preloadVideo",
	audio: "preloadAudio",
	image: "preloadImage",
	font: "preloadFont",
};

const entries = new Map<string, Entry>();

function createElement(kind: Kind, url: string): HTMLElement {
	if (kind === "video" || kind === "audio") {
		const media = document.createElement(kind);
		media.preload = "auto";
		media.muted = true;
		media.style.display = "none";
		media.src = url;
		document.body.appendChild(media);
		return media;
	}
	const link = document.createElement("link");
	link.rel = "preload";
	link.as = kind;
	// Fonts are always fetched in CORS mode: a preload without crossorigin would not be reused by
	// @font-face, and the font would download twice.
	if (kind === "font") link.crossOrigin = "anonymous";
	link.href = url;
	document.head.appendChild(link);
	return link;
}

function describeFailure(element: HTMLElement): string {
	if (element instanceof HTMLMediaElement && element.error) {
		return element.error.message || `media error ${element.error.code}`;
	}
	return "the request failed";
}

function preload(kind: Kind, src: string, options: PreloadOptions): () => void {
	const name = NAMES[kind];
	if (typeof src !== "string") {
		throw new TypeError(`${name}(): src is ${typeof src}: pass the URL as a string.`);
	}
	if (typeof document === "undefined") {
		console.warn(`${name}() needs a browser: there is no document here, so nothing is preloaded.`);
		return () => undefined;
	}
	const url = new URL(src, document.baseURI).href;
	const key = `${kind} ${url}`;
	let entry = entries.get(key);
	if (!entry) {
		const element = createElement(kind, url);
		const created: Entry = { element, users: 0, state: "loading", error: null, waiters: new Set() };
		const settle = (error: Error | null) => {
			if (created.state !== "loading") return;
			created.state = error ? "failed" : "ready";
			created.error = error;
			for (const waiter of created.waiters) notify(waiter, created);
		};
		const media = kind === "video" || kind === "audio";
		element.addEventListener(media ? "canplaythrough" : "load", () => settle(null));
		element.addEventListener("error", () =>
			settle(new Error(`${name}() could not load ${src}: ${describeFailure(element)}.`)),
		);
		entries.set(key, created);
		entry = created;
	}
	const held = entry;
	held.users++;
	const waiter = { ...options, onReady: options.onReady ?? (() => undefined) };
	if (held.state === "loading") held.waiters.add(waiter);
	else queueMicrotask(() => notify(waiter, held));

	let freed = false;
	return () => {
		if (freed) return;
		freed = true;
		held.waiters.delete(waiter);
		held.users--;
		if (held.users > 0 || entries.get(key) !== held) return;
		entries.delete(key);
		const { element } = held;
		if (element instanceof HTMLMediaElement) {
			// Stops the download and releases the buffered data.
			element.removeAttribute("src");
			element.load();
		}
		element.remove();
	};
}

function notify(waiter: PreloadOptions & { onReady: () => void }, entry: Entry): void {
	if (entry.state === "ready") waiter.onReady();
	else if (entry.error) {
		if (waiter.onError) waiter.onError(entry.error);
		else console.warn(entry.error.message);
	}
}

/**
 * Preloads a video so a `<Video>`, `<OffthreadVideo>` or `<Html5Video>` mounted later in a Player
 * starts without loading: a hidden `<video preload="auto">` buffers it, and Chrome shares the
 * buffered data with every media element of the page that plays the same file, redirects
 * included. No CORS is needed. Returns a function that stops the preload; calls for the same URL
 * share one element, removed when the last one is freed. Does nothing (with a warning) outside
 * the browser and is never needed for rendering.
 */
export function preloadVideo(src: string, options: PreloadOptions = {}): () => void {
	return preload("video", src, options);
}

/** Like `preloadVideo()`, for audio (`<Audio>`, `<Html5Audio>`), with a hidden `<audio>`. */
export function preloadAudio(src: string, options: PreloadOptions = {}): () => void {
	return preload("audio", src, options);
}

/**
 * Preloads an image for `<Img>` with `<link rel="preload" as="image">`. Returns a function that
 * removes the link; calls for the same URL share it.
 */
export function preloadImage(src: string, options: PreloadOptions = {}): () => void {
	return preload("image", src, options);
}

/**
 * Preloads a font file with `<link rel="preload" as="font" crossorigin="anonymous">`, the form an
 * `@font-face` rule reuses. Returns a function that removes the link; calls for the same URL share
 * it.
 */
export function preloadFont(src: string, options: PreloadOptions = {}): () => void {
	return preload("font", src, options);
}

/**
 * The URL `src` ends up at after every redirect. Requests it with `fetch()` and stops reading as
 * soon as the response headers arrive, so the body is not downloaded. Resolves for any status
 * (a 404 resolves with its URL); rejects with `fetch()`'s `TypeError` when the request fails,
 * including when another origin does not allow CORS.
 */
export async function resolveRedirect(src: string): Promise<string> {
	if (typeof src !== "string") {
		throw new TypeError(`resolveRedirect(): src is ${typeof src}: pass the URL as a string.`);
	}
	const controller = new AbortController();
	const base = typeof document === "undefined" ? undefined : document.baseURI;
	const response = await fetch(base === undefined ? src : new URL(src, base).href, {
		signal: controller.signal,
	});
	const url = response.url;
	controller.abort();
	return url;
}
