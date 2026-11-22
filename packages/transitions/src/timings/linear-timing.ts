import { type EasingFunction, interpolate } from "@motiojs/core";
import type { TransitionTiming } from "../types.js";

/** Options of `linearTiming()`. */
export interface LinearTimingOptions {
	/** Length of the transition in frames. */
	durationInFrames: number;
	/** Easing applied to the progress. Default: linear. */
	easing?: EasingFunction;
}

/**
 * A timing whose progress goes from 0 to 1 over `durationInFrames` frames, optionally eased,
 * based on `interpolate()`.
 *
 * @example linearTiming({ durationInFrames: 30, easing: Easing.in(Easing.ease) })
 */
export function linearTiming(options: LinearTimingOptions): TransitionTiming {
	const { durationInFrames, easing } = options ?? ({} as Partial<LinearTimingOptions>);
	if (
		typeof durationInFrames !== "number" ||
		!Number.isFinite(durationInFrames) ||
		durationInFrames < 0
	) {
		throw new TypeError(
			`linearTiming(): "durationInFrames" must be a non-negative finite number, got ${String(durationInFrames)}.`,
		);
	}
	if (easing !== undefined && typeof easing !== "function") {
		throw new TypeError(`linearTiming(): "easing" must be a function, got ${typeof easing}.`);
	}
	return {
		getDurationInFrames: () => durationInFrames,
		getProgress: ({ frame }) => {
			if (durationInFrames === 0) return 1;
			return interpolate(frame, [0, durationInFrames], [0, 1], {
				...(easing ? { easing } : null),
				extrapolateLeft: "clamp",
				extrapolateRight: "clamp",
			});
		},
	};
}
