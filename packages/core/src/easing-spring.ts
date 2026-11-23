import type { EasingFunction } from "./easing.js";
import { measureSpring, resolveConfig, type SpringConfigInput, springPosition } from "./spring.js";

/** Options of `Easing.spring()`: a spring configuration plus how it fits a segment. */
export type EasingSpringConfig = SpringConfigInput & {
	/**
	 * How close to the end value counts as settled when measuring the spring,
	 * whose settling time is then stretched over the segment. Lower values get
	 * closer to the end within the segment. Default 0.005, as in `spring()`.
	 */
	durationRestThreshold?: number | undefined;
	/**
	 * Lets the spring keep settling after the end of its `interpolate()`
	 * segment, while the next segment runs. Default false.
	 */
	allowTail?: boolean | undefined;
};

/**
 * An easing function from `Easing.spring()`. `interpolate()` reads
 * `remotionShouldExtendRight`: when it is `true`, the segment keeps adding its
 * remaining motion after its last keyframe.
 */
export type SpringEasingFunction = EasingFunction & {
	readonly remotionShouldExtendRight: EasingSpringConfig["allowTail"];
};

/** Frame rate and length of the frame grid the spring is measured on. */
const MEASURE_FPS = 30;
const MEASURE_FRAMES = 30;

/**
 * Builds the spring easing curve. The spring is measured as if it ran at 30 fps
 * for 30 frames: its settling time (`measureSpring()` with
 * `durationRestThreshold`) is stretched to progress 1, exactly like
 * `spring({ frame: t * 30, fps: 30, durationInFrames: 30 })`. Without
 * `allowTail`, progress at or after 1 returns 1; with it, the stretched spring
 * carries on past 1. Progress at or before 0 returns 0.
 *
 * Like Remotion, the configuration is validated on the first evaluation that
 * needs the spring (progress strictly between 0 and 1, or past 1 with
 * `allowTail`), not when the easing is created.
 */
export const makeSpringEasing = (config: EasingSpringConfig = {}): SpringEasingFunction => {
	const resolved = resolveConfig(config);
	const tail = config.allowTail;
	let natural: number | undefined;
	const measure = (): number => {
		if (natural !== undefined) return natural;
		if (config.durationRestThreshold === 0) {
			// Remotion never returns here: a spring never comes exactly to rest.
			throw new Error(
				"durationRestThreshold must be greater than 0 for Easing.spring(), otherwise the spring never settles",
			);
		}
		natural = measureSpring({
			fps: MEASURE_FPS,
			config: resolved,
			threshold: config.durationRestThreshold,
		});
		return natural;
	};
	const easing = (t: number): number => {
		if (t <= 0) return 0;
		if (!tail && t >= 1) return 1;
		// Inside the segment: frame t * 30 of the spring stretched from its natural
		// length to 30 frames. In the tail: the unstretched spring at frame
		// t * natural length, the same curve continued.
		let frame: number;
		let time: number;
		if (tail && t >= 1) {
			frame = t * measure();
			time = frame / MEASURE_FPS;
		} else {
			frame = t * MEASURE_FRAMES;
			time = Number.isFinite(frame) ? (frame * (measure() / MEASURE_FRAMES)) / MEASURE_FPS : 0;
		}
		if (!Number.isFinite(frame)) throw new RangeError(`Frame ${frame} is not finite`);
		let progress = springPosition(time, resolved);
		if (resolved.overshootClamping && progress > 1) progress = 1;
		return progress;
	};
	return Object.assign(easing, { remotionShouldExtendRight: tail ?? false });
};
