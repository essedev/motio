/** Physical parameters of a spring. */
export type SpringConfig = {
	/** Mass of the moving object. Lower is faster. Default 1. */
	mass: number;
	/** Damping coefficient: how hard the motion decelerates. Default 10. */
	damping: number;
	/** Stiffness coefficient: higher is snappier and bouncier. Default 100. */
	stiffness: number;
	/** If true, the value stops at `to` instead of overshooting it. Default false. */
	overshootClamping: boolean;
};

const DEFAULT_CONFIG: SpringConfig = {
	mass: 1,
	damping: 10,
	stiffness: 100,
	overshootClamping: false,
};

/** Default `threshold` of `measureSpring()` and `durationRestThreshold` of `spring()`. */
const DEFAULT_THRESHOLD = 0.005;

/**
 * Frames the spring must stay within the threshold, after first entering it,
 * for `measureSpring()` to call it settled. Identified black-box: with this
 * window the measured durations match Remotion's on the whole oracle grid.
 */
const SETTLE_WINDOW_FRAMES = 18;

/** A spring configuration where every field is optional and takes its default. */
export type SpringConfigInput = { [K in keyof SpringConfig]?: SpringConfig[K] | undefined };

const resolveConfig = (config: SpringConfigInput | undefined): SpringConfig => ({
	mass: config?.mass ?? DEFAULT_CONFIG.mass,
	damping: config?.damping ?? DEFAULT_CONFIG.damping,
	stiffness: config?.stiffness ?? DEFAULT_CONFIG.stiffness,
	overshootClamping: config?.overshootClamping ?? DEFAULT_CONFIG.overshootClamping,
});

/**
 * Position of a spring released at rest from 0 towards 1, `t` seconds after
 * release, from the closed-form solution of m x'' + c x' + k (x - 1) = 0.
 *
 * With natural frequency w0 = sqrt(k / m) and damping ratio z = c / (2 sqrt(k m)):
 * - z < 1 (underdamped): 1 - e^(-z w0 t) (cos(wd t) + (z w0 / wd) sin(wd t)), wd = w0 sqrt(1 - z^2).
 * - z >= 1: the critically damped response 1 - e^(-w0 t) (1 + w0 t). Remotion uses it for
 *   every z >= 1 instead of the slower overdamped solution, and so do we, to render the
 *   same motion.
 */
const springPosition = (t: number, { mass, damping, stiffness }: SpringConfig): number => {
	const w0 = Math.sqrt(stiffness / mass);
	const zeta = damping / (2 * Math.sqrt(stiffness * mass));
	if (zeta < 1) {
		const wd = w0 * Math.sqrt(1 - zeta * zeta);
		const envelope = Math.exp(-zeta * w0 * t);
		return 1 - envelope * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
	}
	return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
};

const validateFps = (fps: number, caller: string) => {
	if (!Number.isFinite(fps)) {
		throw new Error(`"fps" must be a finite, but you passed ${fps} to ${caller}`);
	}
	if (fps <= 0) {
		throw new Error(`"fps" must be positive, but got ${fps} to ${caller}`);
	}
};

const validateDamping = (config: SpringConfig) => {
	if (config.damping <= 0) {
		throw new Error(
			"Spring damping must be greater than 0, otherwise the spring() animation will never end, causing an infinite loop.",
		);
	}
};

/** Arguments of `measureSpring()`. */
export type MeasureSpringOptions = {
	/** Frame rate the spring is computed for. */
	fps: number;
	/** The spring's physical configuration, as passed to `spring()`. */
	config?: SpringConfigInput | undefined;
	/**
	 * Distance from the end value, as a fraction of the travel, under which the
	 * spring counts as settled. Default 0.005.
	 */
	threshold?: number | undefined;
	/** @deprecated Has no effect on the duration. */
	from?: number | undefined;
	/** @deprecated Has no effect on the duration. */
	to?: number | undefined;
};

const settledFrame = (config: SpringConfig, fps: number, threshold: number): number => {
	// Written as "not outside" so that a NaN position (mass <= 0 or negative
	// stiffness) counts as settled, like Remotion, instead of looping forever.
	const inside = (frame: number) =>
		!(Math.abs(springPosition(frame / fps, config) - 1) > threshold);
	let frame = 0;
	for (;;) {
		while (!inside(frame)) frame++;
		let left = -1;
		for (let i = 1; i <= SETTLE_WINDOW_FRAMES; i++) {
			if (!inside(frame + i)) {
				left = frame + i;
				break;
			}
		}
		if (left === -1) return frame;
		frame = left;
	}
};

/**
 * Number of frames a spring animation takes to settle, compatible with
 * Remotion's `measureSpring()`. The spring counts as settled at the first frame
 * where it is within `threshold` of its end value and stays there for the
 * following 18 frames. `overshootClamping` does not affect the result.
 * Returns `Infinity` for a threshold of 0. Throws for a non-positive or
 * non-finite `fps`, a negative or NaN threshold, damping <= 0, and zero
 * stiffness (where Remotion never returns).
 *
 * @example measureSpring({ fps: 30, config: { damping: 200 } }) // 23
 */
export const measureSpring = ({
	fps,
	config,
	threshold = DEFAULT_THRESHOLD,
}: MeasureSpringOptions): number => {
	validateFps(fps, "the measureSpring() function");
	if (Number.isNaN(threshold)) throw new Error("Threshold is NaN");
	if (threshold < 0) throw new Error("Threshold is below 0");
	if (threshold === 0) return Number.POSITIVE_INFINITY;
	const resolved = resolveConfig(config);
	validateDamping(resolved);
	if (resolved.stiffness === 0 && threshold < 1) {
		// The spring never moves, so it never settles. Remotion loops forever here.
		throw new Error("Spring stiffness must be greater than 0, otherwise the spring never settles");
	}
	return settledFrame(resolved, fps, threshold);
};

/** Arguments of `spring()`. */
export type SpringOptions = {
	/** Current frame. The animation starts at frame 0 (plus `delay`). */
	frame: number;
	/** Frame rate of the composition. */
	fps: number;
	/** Physical configuration; missing fields take their defaults. */
	config?: SpringConfigInput | undefined;
	/** Start value. Default 0. */
	from?: number | undefined;
	/** End value. Default 1. */
	to?: number | undefined;
	/** Stretches the curve so it settles exactly at this many frames. */
	durationInFrames?: number | undefined;
	/**
	 * With `durationInFrames`, how close to the end value counts as settled when
	 * measuring the natural duration. Default 0.005.
	 */
	durationRestThreshold?: number | undefined;
	/** Frames to wait before the animation starts. Default 0. */
	delay?: number | undefined;
	/** Plays the animation backwards, from `to` to `from`. Default false. */
	reverse?: boolean | undefined;
};

/**
 * Physics-based animation value for a frame, compatible with Remotion's
 * `spring()`: a damped spring released at rest from `from` towards `to`.
 * Operations apply in this order: stretch to `durationInFrames`, reverse,
 * then delay. With `durationInFrames`, frames past the duration return `to`
 * exactly. With `overshootClamping` the value never passes `to`.
 * Throws for a non-finite frame, a non-positive or non-finite `fps`, a
 * non-positive `durationInFrames` or damping <= 0.
 *
 * @example spring({ frame: 10, fps: 30 }) // 1.1552855913778497
 */
export const spring = (options: SpringOptions): number => {
	const {
		frame,
		fps,
		config,
		from = 0,
		to = 1,
		durationInFrames,
		durationRestThreshold,
		delay = 0,
		reverse = false,
	} = options;
	if (!("frame" in options) || frame === undefined) {
		throw new Error('Argument missing for parameter "frame"');
	}
	if (!Number.isFinite(frame)) throw new Error(`Frame ${frame} is not finite`);
	validateFps(fps, "spring()");
	if (durationInFrames !== undefined && !(durationInFrames > 0)) {
		throw new Error(`A "duration" of a spring must be positive, but is ${durationInFrames}`);
	}
	const resolved = resolveConfig(config);
	validateDamping(resolved);

	const needsNatural = durationInFrames !== undefined || reverse;
	const natural = needsNatural
		? measureSpring({ fps, config: resolved, threshold: durationRestThreshold })
		: 0;
	const stretch = durationInFrames === undefined ? 1 : natural / durationInFrames;
	const length = durationInFrames ?? natural;

	const delayed = frame - delay;
	// Before the start, the spring is held at its initial position (time 0).
	const local = Math.max(0, reverse ? length - delayed : delayed);

	// A stretched spring ends exactly at `to` once its duration is over,
	// instead of carrying on with the residual oscillation.
	if (durationInFrames !== undefined && local > durationInFrames) return to;

	let progress = springPosition((local * stretch) / fps, resolved);
	if (resolved.overshootClamping && progress > 1) progress = 1;
	return from + (to - from) * progress;
};
