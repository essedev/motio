// Which frame of an animated image is on screen at a given time. Pure functions, shared by
// <AnimatedImage> and its tests.

/** What an animated image does once its last frame has played. */
export type AnimatedImageLoopBehavior = "loop" | "pause-after-finish" | "clear-after-finish";

/** How long a frame whose duration is 0 stays on screen, in microseconds, as browsers show it. */
export const ZERO_DURATION_US = 100_000;

/** When each frame of an animated image is shown, in microseconds from its start. */
export interface AnimatedImageTimeline {
	/** Start of each frame: the sum of the durations before it. */
	readonly starts: readonly number[];
	/** Display time of each frame, with a duration of 0 replaced by `ZERO_DURATION_US`. */
	readonly durations: readonly number[];
	/** Sum of the durations: one play of the image. `Infinity` for a still image. */
	readonly total: number;
}

/**
 * Builds the timeline from the frame durations an image decoder reports, in microseconds. A
 * duration of 0, a missing one (`null`) or an invalid one lasts `ZERO_DURATION_US`. With
 * `animated: false` (a still image) the single frame lasts forever.
 */
export function animatedImageTimeline(
	durations: ReadonlyArray<number | null>,
	animated = true,
): AnimatedImageTimeline {
	if (!animated && durations.length <= 1) {
		return {
			starts: durations.length === 0 ? [] : [0],
			durations: durations.length === 0 ? [] : [Number.POSITIVE_INFINITY],
			total: durations.length === 0 ? 0 : Number.POSITIVE_INFINITY,
		};
	}
	const starts: number[] = [];
	const shown: number[] = [];
	let total = 0;
	for (const d of durations) {
		const duration = typeof d === "number" && Number.isFinite(d) && d > 0 ? d : ZERO_DURATION_US;
		starts.push(total);
		shown.push(duration);
		total += duration;
	}
	return { starts, durations: shown, total };
}

/**
 * Time of a (possibly fractional) frame of the image's timeline, in microseconds. Rounded to the
 * nanosecond, so that a frame which falls exactly on a frame boundary of the image (frame 3 at
 * 30 fps is 100 ms) is not pushed below it by floating-point error.
 */
export function animatedImageTimeAt(frame: number, fps: number): number {
	const us = (frame * 1_000_000) / fps;
	return Math.round(us * 1000) / 1000;
}

/**
 * The index of the frame shown at `timeUs`: the frame whose display interval contains the time,
 * where an interval starts at the sum of the previous durations (inclusive) and ends at the next
 * start (exclusive). Once one play is over (`timeUs >= total`): `"pause-after-finish"` holds the
 * last frame, `"clear-after-finish"` gives `null` (nothing shown), and `"loop"` (or any other
 * value) starts over. Negative times show the first frame. An image without frames gives `null`.
 */
export function animatedImageFrameAt(
	timeline: AnimatedImageTimeline,
	timeUs: number,
	loopBehavior: string = "loop",
): number | null {
	const { starts, total } = timeline;
	const count = starts.length;
	if (count === 0) return null;
	let time = Number.isFinite(timeUs) ? Math.max(0, timeUs) : 0;
	if (time >= total) {
		if (loopBehavior === "pause-after-finish") return count - 1;
		if (loopBehavior === "clear-after-finish") return null;
		time %= total;
	}
	// The last start at or before the time.
	let low = 0;
	let high = count - 1;
	while (low < high) {
		const middle = (low + high + 1) >> 1;
		if ((starts[middle] as number) <= time) low = middle;
		else high = middle - 1;
	}
	return low;
}
