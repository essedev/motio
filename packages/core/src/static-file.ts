import { getRemotionEnvironment } from "./environment.js";
import { pageWarnings } from "./page-warnings.js";

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
 *
 * Reference files of `public/` through it rather than with a hard-coded `/file.png` URL: the
 * preview, a bundle and a bundle served from a sub-path put them under different bases, which
 * this URL follows.
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
	warnOnCaseMismatch(trimmed);
	const encoded = trimmed.split("/").map(encodeURIComponent).join("/");
	return `${staticBase()}${encoded}`;
}

let caseIndex: { list: unknown[]; exact: Set<string>; lower: Map<string, string> } | null = null;

/**
 * Warns when `path` is not a file of `public/` but differs from one only in case. macOS and
 * Windows file systems ignore case, so the render works there and fails on Linux, where CI and
 * servers usually run.
 */
function warnOnCaseMismatch(path: string): void {
	const list =
		bundleContext()?.staticFiles ?? (globalThis as Record<string, unknown>)[STATIC_FILES_GLOBAL];
	if (!Array.isArray(list) || list.length === 0) return;
	if (caseIndex?.list !== list) {
		const exact = new Set<string>();
		const lower = new Map<string, string>();
		for (const f of list) {
			const name = f && typeof f === "object" ? (f as { name?: unknown }).name : undefined;
			if (typeof name !== "string") continue;
			exact.add(name);
			lower.set(name.toLowerCase(), name);
		}
		caseIndex = { list, exact, lower };
	}
	if (caseIndex.exact.has(path)) return;
	const actual = caseIndex.lower.get(path.toLowerCase());
	if (actual === undefined) return;
	const message = `staticFile(${JSON.stringify(path)}) names public/${actual} with a different case. It loads on macOS and Windows, whose file systems ignore case, and fails on Linux: write staticFile(${JSON.stringify(actual)}).`;
	if (pageWarnings.report({ code: "W_STATIC_FILE_CASE", message })) console.warn(message);
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
 * does not have: as Remotion does outside the Studio, it warns once per call (in its own words)
 * and the callback never fires. Returns a handle whose `cancel()` does nothing.
 */
export function watchStaticFile(
	fileName: string,
	callback: (newData: StaticFile | null) => void,
): WatchStaticFileHandle {
	void callback;
	console.warn(
		`watchStaticFile("${fileName}") has no effect: changes to public/ files are reported only in a studio, which Motio does not have, so the callback is never called.`,
	);
	return { cancel: () => {} };
}
