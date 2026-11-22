import { measureSpring, type SpringConfig, spring } from "@motiojs/core";
import type { TransitionTiming } from "../types.js";

/** Options of `springTiming()`. */
export interface SpringTimingOptions {
	/** Physical configuration of the spring, as for `spring()`. Missing fields take defaults. */
	config?: Partial<SpringConfig>;
	/**
	 * Stretches the curve to exactly this many frames. Default: the natural duration of the
	 * spring, measured with `measureSpring()` and `durationRestThreshold`.
	 */
	durationInFrames?: number;
	/** Distance from the end under which the spring counts as settled. Default 0.005. */
	durationRestThreshold?: number;
	/** Plays the timing curve backwards, as `spring({ reverse: true })` does. Default false. */
	reverse?: boolean;
}

/**
 * A timing that follows a `spring()` animation from 0 to 1. Its duration is `durationInFrames`
 * when given, otherwise the frames the spring takes to settle.
 *
 * @example springTiming({ config: { damping: 200 } }).getDurationInFrames({ fps: 30 }) // 23
 */
export function springTiming(options: SpringTimingOptions = {}): TransitionTiming {
	const { config, durationInFrames, durationRestThreshold, reverse = false } = options;
	if (
		durationInFrames !== undefined &&
		(typeof durationInFrames !== "number" ||
			!Number.isFinite(durationInFrames) ||
			durationInFrames <= 0)
	) {
		throw new TypeError(
			`springTiming(): "durationInFrames" must be a positive finite number, got ${String(durationInFrames)}.`,
		);
	}
	return {
		getDurationInFrames: ({ fps }) =>
			durationInFrames ?? measureSpring({ fps, config, threshold: durationRestThreshold }),
		getProgress: ({ frame, fps }) =>
			spring({ frame, fps, config, durationInFrames, durationRestThreshold, reverse }),
	};
}
