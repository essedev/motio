import { BUNDLE_GLOBAL, STATIC_BASE_GLOBAL, STATIC_FILES_GLOBAL } from "./static-file.js";

/** Codes of the errors a missing or broken asset fails the render with. */
export type AssetErrorCode = "E_ASSET_NOT_FOUND" | "E_FONT_LOAD";

/**
 * An asset the composition needs could not be loaded. Passed to `cancelRender()`, its `code` and
 * `details` reach the renderer's error instead of the generic cancellation.
 */
export class AssetError extends Error {
	readonly code: AssetErrorCode;
	readonly details: Record<string, unknown>;

	constructor(code: AssetErrorCode, message: string, details: Record<string, unknown> = {}) {
		super(message);
		// "Error", like the plain errors these replace: code that tells failures apart by name
		// (and Remotion's loadFont, which rejects with an Error) sees no difference.
		this.name = "Error";
		this.code = code;
		this.details = details;
	}
}

/** True for an error carrying one of the asset codes, from any copy of this module. */
export function isAssetError(err: unknown): err is AssetError {
	if (!err || typeof err !== "object") return false;
	const code = (err as { code?: unknown }).code;
	return code === "E_ASSET_NOT_FOUND" || code === "E_FONT_LOAD";
}

interface BundleFiles {
	/** The static base with a trailing slash, or null without a bundle context. */
	staticBase: string | null;
	names: string[] | null;
}

function bundleFiles(): BundleFiles {
	const g = globalThis as Record<string, unknown>;
	const ctx = g[BUNDLE_GLOBAL];
	const record = ctx && typeof ctx === "object" ? (ctx as Record<string, unknown>) : {};
	const base = record.staticBase ?? g[STATIC_BASE_GLOBAL];
	const files = record.staticFiles ?? g[STATIC_FILES_GLOBAL];
	const names = Array.isArray(files)
		? files
				.map((f) => (f && typeof f === "object" ? (f as { name?: unknown }).name : undefined))
				.filter((n): n is string => typeof n === "string")
		: null;
	const staticBase = typeof base === "string" ? (base.endsWith("/") ? base : `${base}/`) : null;
	return { staticBase, names };
}

/** The names of the files in `public/`, when the bundle lists them; null otherwise. */
export function staticFileNames(): string[] | null {
	return bundleFiles().names;
}

/**
 * The path inside `public/` a URL points to, or null when it is not a static file URL. Accepts
 * the URL as `staticFile()` returns it (the static base, absolute or relative) and absolute URLs
 * on the page's origin.
 */
export function staticPathOf(url: string): string | null {
	const { staticBase } = bundleFiles();
	let path = url;
	if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
		if (typeof location === "undefined") return null;
		let parsed: URL;
		try {
			parsed = new URL(url);
		} catch {
			return null;
		}
		if (parsed.origin !== location.origin) return null;
		path = parsed.pathname;
	}
	path = path.split(/[?#]/)[0] ?? "";
	const candidates = ["/public/"];
	if (staticBase !== null) {
		candidates.unshift(staticBase);
		if (!staticBase.startsWith("/") && typeof location !== "undefined") {
			try {
				candidates.unshift(new URL(staticBase, location.href).pathname);
			} catch {
				// An unparsable base is only compared as given.
			}
		}
	}
	for (const prefix of candidates) {
		if (path.startsWith(prefix)) {
			const rest = path.slice(prefix.length);
			try {
				return rest.split("/").map(decodeURIComponent).join("/");
			} catch {
				return rest;
			}
		}
	}
	return null;
}

/** Levenshtein distance, capped: returns `cap + 1` as soon as the distance exceeds `cap`. */
export function editDistance(a: string, b: string, cap = Number.POSITIVE_INFINITY): number {
	if (Math.abs(a.length - b.length) > cap) return cap + 1;
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const cur = [i];
		let rowMin = i;
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			const value = Math.min(
				(prev[j] as number) + 1,
				(cur[j - 1] as number) + 1,
				(prev[j - 1] as number) + cost,
			);
			cur.push(value);
			if (value < rowMin) rowMin = value;
		}
		if (rowMin > cap) return cap + 1;
		prev = cur;
	}
	return prev[b.length] as number;
}

/**
 * The file of `names` closest to `path`: the same name in another case first, else the nearest
 * name within a third of its length (at least 2 edits), compared without case. Null when nothing
 * is close.
 */
export function nearestName(path: string, names: readonly string[]): string | null {
	const lower = path.toLowerCase();
	const sameCase = names.find((n) => n !== path && n.toLowerCase() === lower);
	if (sameCase) return sameCase;
	const cap = Math.max(2, Math.floor(path.length / 3));
	let best: string | null = null;
	let bestDistance = cap + 1;
	for (const name of names) {
		if (name === path) continue;
		const d = editDistance(lower, name.toLowerCase(), bestDistance - 1);
		if (d < bestDistance) {
			best = name;
			bestDistance = d;
		}
	}
	return best;
}

/** What is known about a URL that answered 404: its path in `public/` and a near file name. */
export interface MissingAsset {
	url: string;
	/** `public/<path>` for a static file, else the URL in quotes. */
	display: string;
	/** Path inside `public/`, or null when the URL is not a static file. */
	path: string | null;
	/** A file in `public/` with a close name, or null. */
	suggestion: string | null;
}

/** Describes a URL that could not be found, for error messages. */
export function describeMissingAsset(url: string): MissingAsset {
	const path = staticPathOf(url);
	const names = staticFileNames();
	const suggestion = path !== null && names ? nearestName(path, names) : null;
	return { url, display: path === null ? JSON.stringify(url) : `public/${path}`, path, suggestion };
}

/** " Did you mean ...?" for a missing asset, or "". */
export function suggestionText(missing: MissingAsset): string {
	return missing.suggestion === null
		? ""
		: ` Did you mean staticFile(${JSON.stringify(missing.suggestion)})?`;
}

/** The structured details of a missing asset, for `AssetError.details`. */
export function missingAssetDetails(missing: MissingAsset): Record<string, unknown> {
	const out: Record<string, unknown> = { url: missing.url };
	if (missing.path !== null) out.path = missing.path;
	if (missing.suggestion !== null) out.suggestion = missing.suggestion;
	return out;
}

/**
 * The HTTP status of `url` from a HEAD request, or null when it cannot be told (no `fetch`, a
 * network error, a cross-origin URL without CORS). Used to tell a missing file (404), which no
 * retry fixes, from a transient failure.
 */
export async function probeStatus(url: string): Promise<number | null> {
	if (typeof fetch !== "function" || /^(data|blob):/i.test(url)) return null;
	try {
		const res = await fetch(url, { method: "HEAD", cache: "no-store" });
		return res.status;
	} catch {
		return null;
	}
}
