/**
 * `@motiojs/gif`, the equivalent of `@remotion/gif`: GIFs decoded in JavaScript and drawn frame by
 * frame on a canvas, in sync with the timeline.
 */
export {
	type GetGifDurationInSecondsOptions,
	getGifDurationInSeconds,
} from "./get-gif-duration-in-seconds.js";
export { Gif, type GifFillMode, type GifLoadInfo, type GifProps } from "./gif.js";
export { type PreloadGifOptions, type PreloadGifResult, preloadGif } from "./preload-gif.js";
export type { GifLoopBehavior } from "./timing.js";
