import type { LoopRange } from "./range.js";

/** What the page keeps per composition across reloads (hot reload, F5) in the same tab. */
export interface CompositionSession {
	frame: number;
	range: LoopRange;
	/** The props editor text, kept even when it is not valid JSON. */
	propsText: string | null;
}

/** Preferences shared by every composition. */
export interface PreviewPreferences {
	zoom: Zoom;
	playbackRate: number;
	loop: boolean;
	/** The timeline lists the sequences (true) or shows only its ruler. */
	timeline: boolean;
}

/** `fit` scales the composition to the stage; a number is a fixed scale. */
export type Zoom = "fit" | number;

/** Zoom levels the page offers. */
export const ZOOM_LEVELS: readonly Zoom[] = ["fit", 0.25, 0.5, 1, 2];

/** Playback rates the page offers. */
export const PLAYBACK_RATES: readonly number[] = [0.25, 0.5, 1, 1.5, 2, 4];

const PREFIX = "motio.preview.";

export const DEFAULT_PREFERENCES: PreviewPreferences = {
	zoom: "fit",
	playbackRate: 1,
	loop: true,
	timeline: true,
};

// sessionStorage can be missing or throw (privacy modes, sandboxed frames): the page then works
// without persistence, which only costs the restored frame after a reload.
function storage(): Storage | null {
	try {
		return typeof sessionStorage === "undefined" ? null : sessionStorage;
	} catch {
		return null;
	}
}

function read(key: string): unknown {
	try {
		const text = storage()?.getItem(PREFIX + key);
		return text ? (JSON.parse(text) as unknown) : null;
	} catch {
		return null;
	}
}

function write(key: string, value: unknown): void {
	try {
		storage()?.setItem(PREFIX + key, JSON.stringify(value));
	} catch {
		// Quota or access errors: persistence is a convenience, see storage().
	}
}

const isFrame = (value: unknown): value is number =>
	typeof value === "number" && Number.isInteger(value) && value >= 0;

/** Reads the saved session of a composition, ignoring malformed values. */
export function readSession(id: string): CompositionSession {
	const value = read(`composition.${id}`) as Partial<Record<string, unknown>> | null;
	const range = (value?.range ?? {}) as Partial<Record<string, unknown>>;
	return {
		frame: isFrame(value?.frame) ? value.frame : 0,
		range: {
			inFrame: isFrame(range.inFrame) ? range.inFrame : null,
			outFrame: isFrame(range.outFrame) ? range.outFrame : null,
		},
		propsText: typeof value?.propsText === "string" ? value.propsText : null,
	};
}

/** Saves the session of a composition. */
export function writeSession(id: string, session: CompositionSession): void {
	write(`composition.${id}`, session);
}

/** Reads the shared preferences. */
export function readPreferences(): PreviewPreferences {
	const value = read("preferences") as Partial<Record<string, unknown>> | null;
	const zoom = value?.zoom;
	const rate = value?.playbackRate;
	return {
		zoom: ZOOM_LEVELS.includes(zoom as Zoom) ? (zoom as Zoom) : DEFAULT_PREFERENCES.zoom,
		playbackRate: PLAYBACK_RATES.includes(rate as number)
			? (rate as number)
			: DEFAULT_PREFERENCES.playbackRate,
		loop: typeof value?.loop === "boolean" ? value.loop : DEFAULT_PREFERENCES.loop,
		timeline: typeof value?.timeline === "boolean" ? value.timeline : DEFAULT_PREFERENCES.timeline,
	};
}

/** Saves the shared preferences. */
export function writePreferences(preferences: PreviewPreferences): void {
	write("preferences", preferences);
}

/** The composition id in a URL hash (`#/MyComp`), or null. */
export function compositionFromHash(hash: string): string | null {
	const raw = hash.replace(/^#\/?/, "");
	if (raw === "") return null;
	try {
		return decodeURIComponent(raw);
	} catch {
		return null;
	}
}

/** The URL hash that selects a composition. */
export function hashForComposition(id: string): string {
	return `#/${encodeURIComponent(id)}`;
}
