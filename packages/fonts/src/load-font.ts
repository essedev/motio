import { cancelRender, continueRender, delayRender } from "@motiojs/core";
import {
	AssetError,
	describeMissingAsset,
	missingAssetDetails,
	suggestionText,
} from "@motiojs/core/internals";

/** Font file formats `loadFont()` accepts. */
export type FontFormat = "woff2" | "woff" | "opentype" | "truetype";

/** Options of `loadFont()`. Descriptors mirror the CSS `@font-face` descriptors. */
export interface LoadFontOptions {
	/** Name to reference in CSS `font-family`. */
	family: string;
	/** URL of the font file, for example from `staticFile()`. */
	url: string;
	/** Derived from the URL's extension (ignoring query and hash) when omitted. */
	format?: FontFormat;
	ascentOverride?: string;
	descentOverride?: string;
	lineGapOverride?: string;
	/** CSS `font-display`. */
	display?: FontDisplay;
	/** CSS `font-feature-settings`. */
	featureSettings?: string;
	/** CSS `font-stretch`. */
	stretch?: string;
	/** CSS `font-style`. */
	style?: string;
	/** CSS `font-weight`. */
	weight?: string | number;
	/** CSS `unicode-range`. */
	unicodeRange?: string;
}

const EXTENSIONS: Record<string, FontFormat> = {
	woff2: "woff2",
	woff: "woff",
	otf: "opentype",
	ttf: "truetype",
};

/** The format implied by the URL's file extension, ignoring query string and hash. */
export function formatFromUrl(url: string): FontFormat | null {
	const path = url.split(/[?#]/)[0] ?? "";
	const extension = path.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
	return extension === undefined ? null : (EXTENSIONS[extension] ?? null);
}

const files = new Map<string, Promise<ArrayBuffer>>();

function fetchFont(url: string): Promise<ArrayBuffer> {
	const cached = files.get(url);
	if (cached) return cached;
	const pending = fetch(url).then(
		async (response) => {
			if (!response.ok) {
				const missing = describeMissingAsset(url);
				const what =
					response.status === 404 || response.status === 410
						? `the file does not exist (HTTP ${response.status})`
						: `the server answered HTTP ${response.status} ${response.statusText}`;
				throw new AssetError(
					"E_FONT_LOAD",
					`loadFont() could not fetch ${missing.display}: ${what}.${suggestionText(missing)}`,
					{ ...missingAssetDetails(missing), status: response.status },
				);
			}
			return response.arrayBuffer();
		},
		(err: unknown) => {
			throw new AssetError(
				"E_FONT_LOAD",
				`loadFont() could not fetch "${url}": ${err instanceof Error ? err.message : String(err)}.`,
				{ url },
			);
		},
	);
	files.set(url, pending);
	pending.catch(() => {
		if (files.get(url) === pending) files.delete(url);
	});
	return pending;
}

function descriptors(options: LoadFontOptions): FontFaceDescriptors {
	const out: FontFaceDescriptors = {};
	if (options.ascentOverride !== undefined) out.ascentOverride = options.ascentOverride;
	if (options.descentOverride !== undefined) out.descentOverride = options.descentOverride;
	if (options.lineGapOverride !== undefined) out.lineGapOverride = options.lineGapOverride;
	if (options.display !== undefined) out.display = options.display;
	if (options.featureSettings !== undefined) out.featureSettings = options.featureSettings;
	if (options.stretch !== undefined) out.stretch = options.stretch;
	if (options.style !== undefined) out.style = options.style;
	if (options.weight !== undefined) out.weight = String(options.weight);
	if (options.unicodeRange !== undefined) out.unicodeRange = options.unicodeRange;
	return out;
}

async function load(options: LoadFontOptions): Promise<void> {
	const format = options.format ?? formatFromUrl(options.url);
	if (format === null) {
		throw new AssetError(
			"E_FONT_LOAD",
			`loadFont() cannot tell the font format from the URL "${options.url}": pass format ("woff2", "woff", "opentype" or "truetype").`,
			{ url: options.url },
		);
	}
	// The font is fetched as bytes so a missing file fails with its HTTP status; the browser
	// detects the actual format from the bytes, so `format` only has to be known.
	const data = await fetchFont(options.url);
	const face = new FontFace(options.family, data, descriptors(options));
	try {
		await face.load();
	} catch (err) {
		throw new AssetError(
			"E_FONT_LOAD",
			`loadFont() fetched "${options.url}" but the browser could not decode it as a font (${err instanceof Error ? err.message : String(err)}). Check that the file is a woff2, woff, otf or ttf font.`,
			{ url: options.url, family: options.family },
		);
	}
	document.fonts.add(face);
}

/**
 * Loads a font file and registers it under `family`, blocking the render until it is ready. A
 * failed load (for example a 404) fails the render and rejects the returned promise.
 */
export function loadFont(options: LoadFontOptions): Promise<void> {
	const handle = delayRender(`Loading font "${options.family}" from ${options.url}`);
	return load(options).then(
		() => {
			continueRender(handle);
		},
		(err: unknown) => {
			continueRender(handle);
			try {
				cancelRender(err);
			} catch {
				// cancelRender() records the failure for the renderer and rethrows by contract; the
				// error reaches the caller through the rejection below instead.
			}
			throw err;
		},
	);
}
