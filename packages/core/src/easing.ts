/** A function that maps animation progress (usually 0..1) to eased progress. */
export type EasingFunction = (t: number) => number;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

// Cubic bezier with P0 = (0, 0) and P3 = (1, 1): each coordinate is
// B(s) = 3(1-s)^2 s p1 + 3(1-s) s^2 p2 + s^3, written as a polynomial in s.
const coefficients = (p1: number, p2: number) => {
	const c = 3 * p1;
	const b = 3 * (p2 - p1) - c;
	const a = 1 - c - b;
	return { a, b, c };
};

const SAMPLE_COUNT = 11;
const SAMPLE_STEP = 1 / (SAMPLE_COUNT - 1);
const NEWTON_ITERATIONS = 4;
const NEWTON_MIN_SLOPE = 0.001;
const BISECTION_PRECISION = 1e-7;
const BISECTION_MAX_ITERATIONS = 10;

/**
 * A CSS-style cubic bezier timing function through (0, 0), (x1, y1), (x2, y2),
 * (1, 1). For a progress x it solves B_x(s) = x for the curve parameter s and
 * returns B_y(s). The solver starts from a table of 11 samples, refines with
 * Newton-Raphson where the curve is steep enough and falls back to bisection
 * where it is flat. These parameters reproduce Remotion's outputs exactly
 * (identified black-box against the oracle fixtures).
 */
const cubicBezier = (x1: number, y1: number, x2: number, y2: number): EasingFunction => {
	if (!(x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1)) {
		throw new Error("bezier x values must be in [0, 1] range");
	}
	// Like a CSS timing function, the curve is only defined on [0, 1]: input
	// outside it returns the nearest end point.
	if (x1 === y1 && x2 === y2) return (t) => clamp01(t);

	const cx = coefficients(x1, x2);
	const cy = coefficients(y1, y2);
	const curveX = (s: number) => ((cx.a * s + cx.b) * s + cx.c) * s;
	const curveY = (s: number) => ((cy.a * s + cy.b) * s + cy.c) * s;
	const slopeX = (s: number) => (3 * cx.a * s + 2 * cx.b) * s + cx.c;

	const samples = new Float64Array(SAMPLE_COUNT);
	for (let i = 0; i < SAMPLE_COUNT; i++) samples[i] = curveX(i * SAMPLE_STEP);

	const bisect = (x: number, lowStart: number, highStart: number) => {
		let low = lowStart;
		let high = highStart;
		let s = 0;
		let error = 0;
		let i = 0;
		do {
			s = low + (high - low) / 2;
			error = curveX(s) - x;
			if (error > 0) high = s;
			else low = s;
		} while (Math.abs(error) > BISECTION_PRECISION && ++i < BISECTION_MAX_ITERATIONS);
		return s;
	};

	const newton = (x: number, guess: number) => {
		let s = guess;
		for (let i = 0; i < NEWTON_ITERATIONS; i++) {
			const slope = slopeX(s);
			if (slope === 0) return s;
			s -= (curveX(s) - x) / slope;
		}
		return s;
	};

	const parameterForX = (x: number) => {
		let start = 0;
		let index = 1;
		const last = SAMPLE_COUNT - 1;
		while (index !== last && (samples[index] ?? 0) <= x) {
			start += SAMPLE_STEP;
			index++;
		}
		index--;
		const below = samples[index] ?? 0;
		const above = samples[index + 1] ?? 1;
		const guess = start + ((x - below) / (above - below)) * SAMPLE_STEP;
		const slope = slopeX(guess);
		if (slope >= NEWTON_MIN_SLOPE) return newton(x, guess);
		if (slope === 0) return guess;
		return bisect(x, start, start + SAMPLE_STEP);
	};

	return (t) => {
		if (t <= 0) return 0;
		if (t >= 1) return 1;
		return curveY(parameterForX(t));
	};
};

const bounceOut: EasingFunction = (input) => {
	const t = clamp01(input);
	// Four parabolic arcs with restitution 7.5625 = (2.75)^2, landing at
	// 1/2.75, 2/2.75, 2.5/2.75 and 1.
	if (t < 1 / 2.75) return 7.5625 * t * t;
	if (t < 2 / 2.75) {
		const u = t - 1.5 / 2.75;
		return 7.5625 * u * u + 0.75;
	}
	if (t < 2.5 / 2.75) {
		const u = t - 2.25 / 2.75;
		return 7.5625 * u * u + 0.9375;
	}
	const u = t - 2.625 / 2.75;
	return 7.5625 * u * u + 0.984375;
};

/**
 * Easing functions for `interpolate()` and `interpolateColors()`, compatible
 * with Remotion's `Easing` (whose API follows React Native's). Constant curves
 * (`linear`, `quad`, ...) are easing functions; factories (`poly`, `elastic`,
 * `back`, `bezier`) return one; modifiers (`in`, `out`, `inOut`) transform one.
 */
export const Easing = {
	/** 0 for t <= 0, 1 for any t > 0. */
	step0: (t: number): number => (t > 0 ? 1 : 0),
	/** 0 for t < 1, 1 for any t >= 1. */
	step1: (t: number): number => (t >= 1 ? 1 : 0),
	/** f(t) = t. */
	linear: (t: number): number => t,
	/** A simple inertial curve, the CSS `ease-in` bezier (0.42, 0, 1, 1). */
	ease: (t: number): number => ease(t),
	/** f(t) = t^2. */
	quad: (t: number): number => t * t,
	/** f(t) = t^3. */
	cubic: (t: number): number => t * t * t,
	/** Power curve: returns f(t) = t^n. */
	poly:
		(n: number): EasingFunction =>
		(t) =>
			t ** n,
	/** Sinusoidal: f(t) = 1 - cos(t * pi / 2). */
	sin: (t: number): number => 1 - Math.cos((t * Math.PI) / 2),
	/** Circular: f(t) = 1 - sqrt(1 - t^2), with t clamped to [0, 1]. */
	circle: (t: number): number => {
		const u = clamp01(t);
		return 1 - Math.sqrt(1 - u * u);
	},
	/** Exponential: f(t) = 2^(10 (t - 1)). */
	exp: (t: number): number => 2 ** (10 * (t - 1)),
	/**
	 * A spring-like oscillation: f(t) = 1 - cos(t pi / 2)^3 cos(t pi b).
	 * `bounciness` 0 does not overshoot, 1 (default) overshoots once, N about N times.
	 */
	elastic: (bounciness = 1): EasingFunction => {
		const p = bounciness * Math.PI;
		return (t) => 1 - Math.cos((t * Math.PI) / 2) ** 3 * Math.cos(t * p);
	},
	/** Pulls back before moving: f(t) = t^2 ((s + 1) t - s), s defaults to 1.70158 (10% overshoot). */
	back:
		(s = 1.70158): EasingFunction =>
		(t) =>
			t * t * ((s + 1) * t - s),
	/** Bouncing ball that lands at 1 (Penner's bounce-out curve), t clamped to [0, 1]. */
	bounce: (t: number): number => bounceOut(t),
	/**
	 * Cubic bezier timing function, equivalent to CSS `cubic-bezier(x1, y1, x2, y2)`.
	 * Progress outside [0, 1] returns the nearest end point. Throws if an x
	 * control value is outside [0, 1].
	 */
	bezier: (x1: number, y1: number, x2: number, y2: number): EasingFunction =>
		cubicBezier(x1, y1, x2, y2),
	/** Runs an easing function forwards (identity modifier). */
	in: (easing: EasingFunction): EasingFunction => easing,
	/** Runs an easing function backwards: f(t) = 1 - easing(1 - t). */
	out:
		(easing: EasingFunction): EasingFunction =>
		(t) =>
			1 - easing(1 - t),
	/** Makes an easing symmetrical: forwards for the first half, backwards for the second. */
	inOut:
		(easing: EasingFunction): EasingFunction =>
		(t) =>
			t < 0.5 ? easing(t * 2) / 2 : 1 - easing((1 - t) * 2) / 2,
};

const ease = cubicBezier(0.42, 0, 1, 1);
