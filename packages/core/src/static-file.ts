import { getRemotionEnvironment } from "./environment.js";

/**
 * Global the bundler sets before the user entry runs: the URL prefix under which the project's
 * `public/` folder is served. Defaults to `"/"`.
 */
export const STATIC_BASE_GLOBAL = "__motioStaticBase";

/** Global the bundler sets with the list of files in `public/`, for `getStaticFiles()`. */
export const STATIC_FILES_GLOBAL = "__motioStaticFiles";

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
	const value = (globalThis as Record<string, unknown>)[STATIC_BASE_GLOBAL];
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
	const value = (globalThis as Record<string, unknown>)[STATIC_FILES_GLOBAL];
	if (!Array.isArray(value)) return [];
	return (value as StaticFile[]).slice(0, 10_000).map((f) => ({
		...f,
		src: staticFile(f.name),
	}));
}
