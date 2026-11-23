import { getRemotionEnvironment } from "./environment.js";

/**
 * Global `@motiojs/bundler` sets before the user entry runs, with `staticBase` (the URL prefix
 * under which the project's `public/` folder is served) and `staticFiles` (its file list).
 */
export const BUNDLE_GLOBAL = "__motioBundle";

/** Fallback global for the public base when no bundle context exists. Defaults to `"/"`. */
export const STATIC_BASE_GLOBAL = "__motioStaticBase";

/** Fallback global for the file list when no bundle context exists. */
export const STATIC_FILES_GLOBAL = "__motioStaticFiles";

interface BundleContext {
	staticBase?: unknown;
	staticFiles?: unknown;
}

function bundleContext(): BundleContext | null {
	const value = (globalThis as Record<string, unknown>)[BUNDLE_GLOBAL];
	return value && typeof value === "object" ? (value as BundleContext) : null;
}

/** A file in the `public/` folder, as returned by `getStaticFiles()`. */
export interface StaticFile {
	/** Path relative to `public/`, with forward slashes. */
	name: string;
	/** URL of the file, usable as a `src`. */
	src: string;
	sizeInBytes: number;
	/** Unix time in milliseconds. */
	lastModified: number;
}

function staticBase(): string {
	const value =
		bundleContext()?.staticBase ?? (globalThis as Record<string, unknown>)[STATIC_BASE_GLOBAL];
	const base = typeof value === "string" ? value : "/";
	return base.endsWith("/") ? base : `${base}/`;
}

/**
 * Turns a path inside the project's `public/` folder into a URL. Each path segment is encoded
 * with `encodeURIComponent`, so `#`, `?` and `&` in file names work; do not pre-encode.
 */
export function staticFile(path: string): string {
	if (typeof path !== "string") {
		throw new TypeError(`staticFile() expects a string, got ${typeof path}.`);
	}
	if (/^(https?:|data:|blob:)/i.test(path)) {
		throw new TypeError(
			`staticFile() takes a path inside the public/ folder, not a URL. Use the URL directly: ${path}`,
		);
	}
	if (path.startsWith("./") || path.startsWith("../")) {
		throw new TypeError(
			`staticFile() does not take relative paths: pass the path relative to the public/ folder, e.g. staticFile("${path.replace(/^(\.\.?\/)+/, "")}").`,
		);
	}
	if (/^([a-zA-Z]:[\\/]|\/(Users|home|var|tmp|private|opt|mnt)\/)/.test(path)) {
		throw new TypeError(
			`staticFile() received what looks like an absolute file system path: ${path}. Put the file in public/ and pass its path relative to that folder.`,
		);
	}
	const trimmed = path.replace(/^\/+/, "");
	const encoded = trimmed.split("/").map(encodeURIComponent).join("/");
	return `${staticBase()}${encoded}`;
}

/**
 * The files in the `public/` folder. Only available when rendering (the bundler provides the
 * list); returns an empty array elsewhere.
 */
export function getStaticFiles(): StaticFile[] {
	if (!getRemotionEnvironment().isRendering) return [];
	const value =
		bundleContext()?.staticFiles ?? (globalThis as Record<string, unknown>)[STATIC_FILES_GLOBAL];
	if (!Array.isArray(value)) return [];
	return (value as StaticFile[]).slice(0, 10_000).map((f) => ({
		...f,
		src: staticFile(f.name),
	}));
}

/** Stops a `watchStaticFile()` subscription. */
export interface WatchStaticFileHandle {
	cancel: () => void;
}

/**
 * Calls `callback` when a file of the public folder changes, with its new `StaticFile` entry or
 * `null` once deleted. Remotion documents it as working only in the Remotion Studio, which Motio
 * does not have: as Remotion does outside the Studio, it warns once per call and the callback
 * never fires. Returns a handle whose `cancel()` does nothing.
 */
export function watchStaticFile(
	fileName: string,
	callback: (newData: StaticFile | null) => void,
): WatchStaticFileHandle {
	void fileName;
	void callback;
	console.warn("The watchStaticFile() API is only available while using the Remotion Studio.");
	return { cancel: () => {} };
}
