// Remotion documents @remotion/noise as built on the MIT-licensed
// `simplex-noise` package. Feeding simplex-noise's permutation builder with a
// generator that returns a constant derived from the seed reproduces Remotion's
// outputs bit for bit: `random(seed)` for 2D, `random(random(seed))` for 3D
// and 4D. Both were identified black-box against the oracle fixtures
// (tools/oracle-features): the constant was located by scanning [0, 1) for the
// value whose permutation table reproduces the recorded samples.

import { random } from "@motiojs/core";
import {
	createNoise2D,
	createNoise3D,
	createNoise4D,
	type NoiseFunction2D,
	type NoiseFunction3D,
	type NoiseFunction4D,
} from "simplex-noise";

/** A noise seed: the same seed always gives the same noise field. */
export type NoiseSeed = string | number;

// Building a permutation table costs far more than sampling it, and animations
// sample the same seed on every frame, so each seed's field is built once. The
// caches are bounded so code that derives a new seed per frame cannot grow
// them without limit.
const MAX_CACHED_SEEDS = 256;
const cache2D = new Map<NoiseSeed, NoiseFunction2D>();
const cache3D = new Map<NoiseSeed, NoiseFunction3D>();
const cache4D = new Map<NoiseSeed, NoiseFunction4D>();

const constant2D = (seed: NoiseSeed) => {
	const value = random(seed);
	return () => value;
};

const constant3D4D = (seed: NoiseSeed) => {
	const value = random(random(seed));
	return () => value;
};

const getOrCreate = <F>(cache: Map<NoiseSeed, F>, seed: NoiseSeed, create: () => F): F => {
	const existing = cache.get(seed);
	if (existing !== undefined) return existing;
	const created = create();
	if (cache.size >= MAX_CACHED_SEEDS) cache.clear();
	cache.set(seed, created);
	return created;
};

/**
 * Seeded 2D simplex noise, compatible with Remotion's `noise2D()`.
 * Returns a value in [-1, 1] that changes smoothly with `x` and `y`; the same
 * seed and coordinates always give the same value.
 *
 * @example noise2D("my-seed", 32, 40)
 */
export const noise2D = (seed: NoiseSeed, x: number, y: number): number =>
	getOrCreate(cache2D, seed, () => createNoise2D(constant2D(seed)))(x, y);

/**
 * Seeded 3D simplex noise, compatible with Remotion's `noise3D()`.
 * Returns a value in [-1, 1] that changes smoothly with `x`, `y` and `z`.
 *
 * @example noise3D("my-seed", 32, 40, frame / 30)
 */
export const noise3D = (seed: NoiseSeed, x: number, y: number, z: number): number =>
	getOrCreate(cache3D, seed, () => createNoise3D(constant3D4D(seed)))(x, y, z);

/**
 * Seeded 4D simplex noise, compatible with Remotion's `noise4D()`.
 * Returns a value in [-1, 1] that changes smoothly with `x`, `y`, `z` and `w`.
 *
 * @example noise4D("my-seed", 32, 40, 50, 64)
 */
export const noise4D = (seed: NoiseSeed, x: number, y: number, z: number, w: number): number =>
	getOrCreate(cache4D, seed, () => createNoise4D(constant3D4D(seed)))(x, y, z, w);
