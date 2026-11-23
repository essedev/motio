/** What a GIF does after its last frame. */
export type GifLoopBehavior = "loop" | "pause-after-finish" | "unmount-after-finish";

/**
 * The frame of a GIF shown `timeInMilliseconds` after it started: the first frame whose
 * cumulative delay is past the time. After the last frame, `"pause-after-finish"` holds it,
 * `"unmount-after-finish"` gives `null` (nothing shown), and `"loop"` (or any other value, as in
 * the published package) starts over. A GIF without frames gives `null`.
 */
export function gifFrameIndex(
	timeInMilliseconds: number,
	delays: readonly number[],
	loopBehavior: string,
): number | null {
	if (delays.length === 0) return null;
	const total = delays.reduce((sum, d) => sum + d, 0);
	let time = timeInMilliseconds;
	if (time >= total) {
		if (loopBehavior === "pause-after-finish") return delays.length - 1;
		if (loopBehavior === "unmount-after-finish") return null;
		time %= total;
	}
	let end = 0;
	for (let i = 0; i < delays.length; i++) {
		end += delays[i] as number;
		if (time < end) return i;
	}
	return delays.length - 1;
}
