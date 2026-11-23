// A number seed is scaled by 1e10 and a string seed is hashed with the
// Java-style string hash; either becomes the state of one mulberry32 step
// (Tommy Ettinger's public-domain 32-bit generator). This reproduces
// Remotion's outputs bit for bit; it was identified black-box by testing
// well-known public algorithms against the oracle fixtures.

const MULBERRY32_INCREMENT = 0x6d2b79f5;

/**
 * One mulberry32 step from `state`, as a float in [0, 1). `state` may be any
 * double: each 32-bit operation truncates it modulo 2^32 (NaN and infinities
 * become 0), which is what makes huge and fractional seeds well defined.
 */
const mulberry32 = (state: number): number => {
	let t = (state + MULBERRY32_INCREMENT) | 0;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** 32-bit string hash h = 31 h + c over UTF-16 code units, starting at 0. */
const hashString = (value: string): number => {
	let hash = 0;
	for (let i = 0; i < value.length; i++) {
		hash = (Math.imul(hash, 31) + value.charCodeAt(i)) | 0;
	}
	return hash;
};

/**
 * Deterministic pseudo-random number in [0, 1) for a seed, compatible with
 * Remotion's `random()`: the same seed always gives the same value, in every
 * render process. `random(null)` opts out and returns `Math.random()`.
 * Throws if the seed is neither a number, a string nor null.
 *
 * @example random(1) // 0.07301638228818774
 */
export const random = (seed: number | string | null): number => {
	if (seed === null) return Math.random();
	if (typeof seed === "string") return mulberry32(hashString(seed));
	if (typeof seed === "number") return mulberry32(seed * 1e10);
	throw new Error(
		`random() got a ${typeof seed} seed: pass a number or a string, or null for a different value each call.`,
	);
};
