import { isRemoteAsset } from "./is-remote.js";
import { loadMediaMetadata, memoizeBySrc } from "./media-element.js";
import type { VideoMetadata } from "./types.js";

const load = memoizeBySrc(async (src): Promise<VideoMetadata> => {
	const element = await loadMediaMetadata("video", src, "getVideoMetadata");
	const width = element.videoWidth;
	const height = element.videoHeight;
	if (width === 0 || height === 0) {
		throw new Error(`Unable to determine video metadata for ${src}`);
	}
	return {
		durationInSeconds: element.duration,
		width,
		height,
		aspectRatio: width / height,
		isRemote: isRemoteAsset(src),
	};
});

/**
 * Duration, dimensions and aspect ratio of a video, read by an invisible `<video>` element. Only
 * works in the browser and only for codecs the browser can open. Memoized by `src`.
 *
 * @deprecated Kept for compatibility; a metadata parser such as Mediabunny supports more formats.
 */
export function getVideoMetadata(src: string): Promise<VideoMetadata> {
	return load(src);
}
