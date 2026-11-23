/**
 * `@motiojs/preload`, the equivalent of `@remotion/preload`: preloads videos, audio, images and
 * fonts so a Player shows them without loading, and resolves redirects.
 */
export {
	type PreloadOptions,
	preloadAudio,
	preloadFont,
	preloadImage,
	preloadVideo,
	resolveRedirect,
} from "./preload.js";
