import type { LottiePlaybackDirection } from "./types.js";

/** How the composition frame maps onto the animation. */
export interface LottieTiming {
	loop: boolean;
	playbackRate: number;
	direction: LottiePlaybackDirection | undefined;
	/** The `trimBefore` prop: animation frames skipped at the start. Default 0. */
	trimBefore?: number;
	/** Whether the `freeze` prop holds the frame. */
	frozen?: boolean;
}

/**
 * The animation frame shown at a frame of `<Lottie>`'s timeline (`useCurrentFrame()` inside it,
 * which counts `trimBefore` and follows `freeze`), relative to the animation's in point, as passed
 * to lottie-web's `goToAndStop(value, true)`. One composition frame advances the animation by
 * `playbackRate` of its own frames, whatever the two frame rates are. Without `loop` the animation
 * holds its last frame (`totalFrames - 1`); with it, it starts over at `trimBefore` every
 * `(totalFrames - trimBefore) / playbackRate` frames. A frozen frame does not loop and does not go
 * below `trimBefore`. `"backward"` mirrors the result.
 *
 * Reproduces the published @remotion/lottie value for value, floating-point errors included
 * (docs/DECISIONS.md, D-052): the loop start is subtracted in composition frames before scaling.
 */
export function lottieFrameAt(frame: number, totalFrames: number, timing: LottieTiming): number {
	const { loop, playbackRate } = timing;
	const trim = timing.trimBefore ?? 0;
	// Composition frames since the start, then back to animation frames with the trimmed part
	// added in composition frames: the order the published values need.
	let elapsed = Math.max(frame - trim, 0);
	if (loop && !timing.frozen) {
		const loopLength = (totalFrames - trim) / playbackRate;
		elapsed -= Math.floor(elapsed / loopLength) * loopLength;
	}
	let value = (elapsed + trim / playbackRate) * playbackRate;
	value = Math.min(value, totalFrames - 1);
	return timing.direction === "backward" ? totalFrames - 1 - value : value;
}
