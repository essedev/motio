import { loadMediaMetadata, memoizeBySrc } from "./media-element.js";

const load = memoizeBySrc(async (src) => {
	const element = await loadMediaMetadata("audio", src, "getAudioDurationInSeconds");
	return element.duration;
});

/**
 * Duration of an audio (or video) file in seconds, read by an invisible `<audio>` element.
 * Memoized by `src` for the lifetime of the page.
 *
 * @deprecated Kept for compatibility; a metadata parser such as Mediabunny is faster and supports
 * more formats.
 */
export function getAudioDurationInSeconds(src: string): Promise<number> {
	return load(src);
}

/**
 * Former name of `getAudioDurationInSeconds()`.
 *
 * @deprecated Use `getAudioDurationInSeconds()`.
 */
export const getAudioDuration: (src: string) => Promise<number> = getAudioDurationInSeconds;
