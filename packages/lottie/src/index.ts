/**
 * `@motiojs/lottie`, the equivalent of `@remotion/lottie`: Lottie animations played by lottie-web
 * (a peer dependency) and seeked to the timeline's frame instead of running on the clock.
 */
export { Lottie } from "./lottie.js";
export { getLottieMetadata } from "./metadata.js";
export type {
	LottieAnimationData,
	LottieMetadata,
	LottiePlaybackDirection,
	LottieProps,
	LottieRenderer,
} from "./types.js";
