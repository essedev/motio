import { cancelRender, continueRender, delayRender } from "@motiojs/core";

/** Static description of a Google Font, as returned by `getInfo()`. */
export interface FontInfo {
	readonly fontFamily: string;
	readonly importName: string;
	readonly version: string;
	readonly url: string;
	readonly unicodeRanges: Readonly<Record<string, string>>;
	readonly fonts: Readonly<
		Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>
	>;
	readonly subsets: readonly string[];
	readonly variable?: {
		readonly axes: Readonly<Record<string, { readonly min: number; readonly max: number }>>;
		readonly fontFaces: readonly {
			readonly style: string;
			readonly weight: string;
			readonly stretch: string | null;
			readonly subset: string;
			readonly unicodeRange: string;
			readonly src: string;
		}[];
		readonly url: string;
	};
}

type Styles<I extends FontInfo> = keyof I["fonts"] & string;
type Weights<I extends FontInfo, S extends Styles<I>> = keyof I["fonts"][S] & string;
type Subsets<I extends FontInfo> = I["subsets"][number];

export interface LoadFontOptions<W extends string, Sub extends string> {
	/** Weights to load. Default: every weight of the style. */
	weights?: readonly W[];
	/** Subsets to load. Default: every subset. */
	subsets?: readonly Sub[];
	/** Document to add the faces to, for example an iframe's. Default: `window.document`. */
	document?: Document;
	/** Silence the warning printed when more than 20 files are requested. */
	ignoreTooManyRequestsWarning?: boolean;
}

export interface LoadFontResult<I extends FontInfo> {
	fontFamily: I["fontFamily"];
	fonts: I["fonts"];
	unicodeRanges: I["unicodeRanges"];
	/** Resolves when every requested file has loaded. */
	waitUntilDone: () => Promise<undefined>;
}

interface Face {
	style: string;
	weight: string;
	stretch?: string | null;
	unicodeRange: string;
	src: string;
}

const MAX_REQUESTS_WITHOUT_WARNING = 20;
const loaded = new WeakMap<Document, Map<string, Promise<void>>>();

function loadFace(doc: Document, family: string, face: Face): Promise<void> {
	let perDoc = loaded.get(doc);
	if (!perDoc) {
		perDoc = new Map();
		loaded.set(doc, perDoc);
	}
	const key = `${family}|${face.style}|${face.weight}|${face.src}`;
	const existing = perDoc.get(key);
	if (existing) return existing;
	const FontFaceCtor =
		(doc.defaultView as (Window & typeof globalThis) | null)?.FontFace ?? FontFace;
	const descriptors: FontFaceDescriptors = {
		style: face.style,
		weight: face.weight,
		unicodeRange: face.unicodeRange,
	};
	if (face.stretch) descriptors.stretch = face.stretch;
	const ff = new FontFaceCtor(family, `url(${face.src}) format('woff2')`, descriptors);
	doc.fonts.add(ff);
	const p = ff.load().then(() => undefined);
	perDoc.set(key, p);
	p.catch(() => perDoc?.delete(key));
	return p;
}

function loadFaces(
	family: string,
	faces: Face[],
	options: { document?: Document; ignoreTooManyRequestsWarning?: boolean },
): () => Promise<undefined> {
	if (typeof document === "undefined" && !options.document) return () => Promise.resolve(undefined);
	const doc = options.document ?? document;
	if (faces.length > MAX_REQUESTS_WITHOUT_WARNING && !options.ignoreTooManyRequestsWarning) {
		console.warn(
			`Loading ${family} takes ${faces.length} requests, one per font file. Pass weights and subsets to loadFont() to load only what the video uses, or set ignoreTooManyRequestsWarning: true to hide this warning.`,
		);
	}
	const handle = delayRender(`Fetching ${family} from Google Fonts`);
	const all = Promise.all(faces.map((f) => loadFace(doc, family, f))).then(
		() => {
			continueRender(handle);
			return undefined;
		},
		(err: unknown) => {
			cancelRender(
				err instanceof Error ? err : new Error(`Failed to load ${family}: ${String(err)}`),
			);
			throw err;
		},
	);
	all.catch(() => undefined);
	return () => all;
}

function pick<T extends string>(
	kind: string,
	family: string,
	requested: readonly T[] | undefined,
	available: readonly string[],
): string[] {
	if (!requested) return [...available];
	for (const r of requested) {
		if (!available.includes(r)) {
			throw new Error(`${family} has no ${kind} "${r}". Available: ${available.join(", ")}.`);
		}
	}
	return [...requested];
}

/** Builds the exports of a generated font module from its static information. */
export function createFontModule<const I extends FontInfo>(info: I) {
	const fontFamily = info.fontFamily;
	const allSubsets = Object.keys(info.unicodeRanges);

	function loadFont<S extends Styles<I>>(
		style?: S,
		options: LoadFontOptions<Weights<I, S>, Subsets<I>> = {},
	): LoadFontResult<I> {
		const styles =
			style === undefined
				? Object.keys(info.fonts)
				: pick("style", fontFamily, [style], Object.keys(info.fonts));
		const faces: Face[] = [];
		for (const s of styles) {
			const byWeight = info.fonts[s] ?? {};
			const weights = pick("weight", fontFamily, options.weights, Object.keys(byWeight));
			const subsets = pick("subset", fontFamily, options.subsets, allSubsets);
			for (const w of weights) {
				for (const sub of subsets) {
					const src = byWeight[w]?.[sub];
					if (src)
						faces.push({ style: s, weight: w, unicodeRange: info.unicodeRanges[sub] ?? "", src });
				}
			}
		}
		const waitUntilDone = loadFaces(fontFamily, faces, options);
		return { fontFamily, fonts: info.fonts, unicodeRanges: info.unicodeRanges, waitUntilDone };
	}

	function loadVariableFont(
		style: string,
		options: {
			subsets: readonly Subsets<I>[];
			document?: Document;
			ignoreTooManyRequestsWarning?: boolean;
		},
	) {
		const variable = info.variable;
		if (!variable) throw new Error(`${fontFamily} is not available as a variable font.`);
		if (!options?.subsets || options.subsets.length === 0) {
			throw new Error(`loadVariableFont() for ${fontFamily} needs at least one subset.`);
		}
		const styles = [...new Set(variable.fontFaces.map((f) => f.style))];
		pick("style", fontFamily, [style], styles);
		const subsets = pick("subset", fontFamily, options.subsets, [
			...new Set(variable.fontFaces.map((f) => f.subset)),
		]);
		const faces = variable.fontFaces.filter((f) => f.style === style && subsets.includes(f.subset));
		const waitUntilDone = loadFaces(fontFamily, faces, options);
		return { fontFamily, axes: variable.axes, waitUntilDone };
	}

	return { fontFamily, getInfo: (): I => info, loadFont, loadVariableFont };
}
