/**
 * How a component maps a time to a source frame. `floor` shows the last frame whose
 * timestamp is not after the time (`OffthreadVideo`, `@remotion/media` `Video`); `nearest`
 * shows the closest frame, later on a tie (the HTML5 `Video`). Both observed from Remotion
 * (fixtures/media/NOTES.md).
 */
export type FrameSelection = "floor" | "nearest";

/** Tolerance for timestamps that should coincide but differ by float rounding. */
const EPSILON = 1e-6;

/** Source time in seconds shown at a composition frame, relative to the video's own start. */
export function sourceTime(options: {
	/** Frame relative to the start of the video's Sequence. */
	frame: number;
	fps: number;
	/** `trimBefore`, in composition frames. */
	trimBefore?: number;
	playbackRate?: number;
}): number {
	const { frame, fps, trimBefore = 0, playbackRate = 1 } = options;
	return (trimBefore + frame * playbackRate) / fps;
}

/** Index of the source frame to show at time `t` (seconds), clamped to the stream. */
export function selectFrame(
	timestamps: readonly number[],
	t: number,
	mode: FrameSelection,
): number {
	const n = timestamps.length;
	if (n === 0) throw new RangeError("no timestamps");
	// Largest i with timestamps[i] <= t + EPSILON.
	let lo = 0;
	let hi = n - 1;
	if ((timestamps[0] ?? 0) > t + EPSILON) return 0;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if ((timestamps[mid] ?? Number.POSITIVE_INFINITY) <= t + EPSILON) lo = mid;
		else hi = mid - 1;
	}
	if (mode === "floor" || lo === n - 1) return lo;
	const before = t - (timestamps[lo] ?? 0);
	const after = (timestamps[lo + 1] ?? Number.POSITIVE_INFINITY) - t;
	return after <= before + EPSILON ? lo + 1 : lo;
}
