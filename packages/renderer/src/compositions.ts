import type { CompositionInfo } from "@motiojs/core/protocol";
import { MotioError } from "./errors.js";
import {
	type BrowserSessionOptions,
	mergeProps,
	openListingPage,
	openSession,
	toVideoConfig,
	type VideoConfig,
} from "./session.js";

/** Options of `getCompositions()`. */
export type GetCompositionsOptions = BrowserSessionOptions;

/** Options of `selectComposition()`. */
export interface SelectCompositionOptions extends BrowserSessionOptions {
	/** Composition id. */
	id: string;
}

function notFound(id: string, list: CompositionInfo[]): MotioError {
	return new MotioError(
		"E_COMPOSITION_NOT_FOUND",
		`No composition with the id "${id}". Available: ${list.map((c) => `"${c.id}"`).join(", ") || "none"}.`,
		{ composition: id, details: { available: list.map((c) => c.id) } },
	);
}

/**
 * Lists the compositions of a bundle, running `calculateMetadata` with the input props for
 * those that define it. Accepts Remotion's legacy positional form `getCompositions(serveUrl,
 * options)` too.
 */
export async function getCompositions(
	optionsOrServeUrl: GetCompositionsOptions | string,
	legacy: Omit<GetCompositionsOptions, "serveUrl"> = {},
): Promise<VideoConfig[]> {
	const options =
		typeof optionsOrServeUrl === "string"
			? { ...legacy, serveUrl: optionsOrServeUrl }
			: optionsOrServeUrl;
	const session = await openSession(options);
	try {
		const page = await openListingPage(session);
		try {
			const list = await page.getCompositions();
			const out: VideoConfig[] = [];
			for (const c of list) {
				const props = mergeProps(c.defaultProps, session.inputProps);
				if (c.hasCalculateMetadata) {
					out.push(toVideoConfig(await page.setComposition(c.id, props), props));
				} else {
					out.push(toVideoConfig(c, props));
				}
			}
			return out;
		} finally {
			await page.close();
		}
	} finally {
		await session.close();
	}
}

/** Returns one composition with its final metadata and props, after `calculateMetadata`. */
export async function selectComposition(options: SelectCompositionOptions): Promise<VideoConfig> {
	const session = await openSession(options);
	try {
		const page = await openListingPage(session);
		try {
			const list = await page.getCompositions();
			const c = list.find((x) => x.id === options.id);
			if (!c) throw notFound(options.id, list);
			const props = mergeProps(c.defaultProps, session.inputProps);
			return toVideoConfig(await page.setComposition(c.id, props), props);
		} finally {
			await page.close();
		}
	} finally {
		await session.close();
	}
}
