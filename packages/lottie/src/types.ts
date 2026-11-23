import type { AnimationItem } from "lottie-web";
import type { CSSProperties } from "react";

/**
 * A Lottie animation as parsed from its JSON file. Only the fields Motio reads are typed; the
 * rest of the Lottie schema passes through to lottie-web unchanged.
 */
export interface LottieAnimationData {
	/** Frame rate of the animation. */
	fr: number;
	/** Width in pixels. */
	w: number;
	/** Height in pixels. */
	h: number;
	/** Out point: the frame after the last one. */
	op: number;
	/** In point: the first frame. Default 0. */
	ip?: number;
	[key: string]: unknown;
}

/** Direction in which a Lottie animation plays. */
export type LottiePlaybackDirection = "forward" | "backward";

/** The lottie-web renderer used to draw the animation. */
export type LottieRenderer = "svg" | "canvas" | "html";

/** Props of `<Lottie>`. */
export interface LottieProps {
	/**
	 * A JSON object following the Lottie schema. A new object identity re-initialises the
	 * animation, so memoize it.
	 */
	animationData: LottieAnimationData;
	/** Class of the `<div>` that contains the animation. */
	className?: string;
	/** `"forward"` (default) or `"backward"`. */
	direction?: LottiePlaybackDirection;
	/** Whether the animation starts over after its last frame. Default `false`. */
	loop?: boolean;
	/** Speed of the animation: 2 is twice as fast. Positive. Default 1. */
	playbackRate?: number;
	/** Styles of the `<div>` that contains the animation. */
	style?: CSSProperties;
	/** Called with lottie-web's `AnimationItem` each time the animation is initialised. */
	onAnimationLoaded?: (animation: AnimationItem) => void;
	/** The lottie-web renderer. Default `"svg"`. */
	renderer?: LottieRenderer;
	/** How the animation fits its container, as an SVG `preserveAspectRatio` value. */
	preserveAspectRatio?: string;
	/** Base path of the image assets that the JSON references with `e: 0`. */
	assetsPath?: string;
	/** Frame of the parent at which the animation starts. Default 0. */
	from?: number;
	/** How many frames the animation stays mounted. Default `Infinity`. */
	durationInFrames?: number;
	/** Frames of the animation's timeline skipped at its start. Default 0. */
	trimBefore?: number;
	/** Hold the animation at this frame of its timeline. */
	freeze?: number | null;
	/** Do not render the animation. */
	hidden?: boolean;
	/** Label in an editor timeline. Default `"<Lottie>"`. */
	name?: string;
	/** Whether an editor timeline shows the animation. Default `false`. */
	showInTimeline?: boolean;
	/** Mount this many frames before `from`, hidden (Player only). */
	premountFor?: number;
	/** Stay mounted this many frames after the end, hidden (Player only). */
	postmountFor?: number;
	/** Styles of the container while premounted, over `opacity: 0; pointer-events: none`. */
	styleWhilePremounted?: CSSProperties;
	/** Styles of the container while postmounted, over `opacity: 0; pointer-events: none`. */
	styleWhilePostmounted?: CSSProperties;
}

/** What `getLottieMetadata()` returns for a valid animation. */
export interface LottieMetadata {
	/** Duration in frames at the animation's own frame rate, rounded down. */
	durationInFrames: number;
	/** Duration in seconds at the animation's own frame rate. */
	durationInSeconds: number;
	/** Natural frame rate of the animation. */
	fps: number;
	/** Natural height in pixels. */
	height: number;
	/** Natural width in pixels. */
	width: number;
}
