/** The frames playback runs over: `[inFrame ?? 0, outFrame ?? durationInFrames - 1]`. */
export interface PlaybackRange {
	start: number;
	end: number;
}

/** Resolves the playback range from the in and out points. */
export function playbackRange(
	durationInFrames: number,
	inFrame: number | null | undefined,
	outFrame: number | null | undefined,
): PlaybackRange {
	const last = Math.max(0, durationInFrames - 1);
	const start = Math.min(inFrame ?? 0, last);
	const end = Math.max(start, Math.min(outFrame ?? last, last));
	return { start, end };
}

/**
 * Whole frames covered by `elapsedMs` of real time at `fps` and `playbackRate`, signed: negative
 * when playing backwards. A frame is shown for its full duration before the next one.
 */
export function framesElapsed(elapsedMs: number, fps: number, playbackRate: number): number {
	if (elapsedMs <= 0) return 0;
	// The epsilon absorbs floating point error at exact frame boundaries (1000 / 30 * 30).
	const frames = Math.floor((elapsedMs * fps * Math.abs(playbackRate)) / 1000 + 1e-9);
	return playbackRate < 0 ? -frames : frames;
}

/** Where playback is after advancing from an anchor frame. */
export interface AdvanceResult {
	frame: number;
	/** True when the end (or the start, playing backwards) was passed without looping. */
	ended: boolean;
}

function mod(n: number, m: number): number {
	return ((n % m) + m) % m;
}

/** Moves `delta` frames from `anchor` inside `range`, wrapping when looping. */
export function advance(
	anchor: number,
	delta: number,
	range: PlaybackRange,
	loop: boolean,
): AdvanceResult {
	if (delta === 0) return { frame: anchor, ended: false };
	const candidate = anchor + delta;
	if (candidate >= range.start && candidate <= range.end) return { frame: candidate, ended: false };
	const forward = delta > 0;
	// Outside the range on the side playback comes from (after a seek outside it): keep going.
	if ((forward && candidate < range.start) || (!forward && candidate > range.end)) {
		return { frame: candidate, ended: false };
	}
	if (loop) {
		const length = range.end - range.start + 1;
		return { frame: range.start + mod(candidate - range.start, length), ended: false };
	}
	return { frame: forward ? range.end : range.start, ended: true };
}

/**
 * The frame playback starts from: the current one, unless it sits at or past the end in the
 * playing direction or outside the range, in which case playback restarts from the range's
 * beginning (its end when playing backwards).
 */
export function startFrameForPlay(
	frame: number,
	range: PlaybackRange,
	playbackRate: number,
): number {
	if (playbackRate > 0) {
		return frame >= range.end || frame < range.start ? range.start : frame;
	}
	return frame <= range.start || frame > range.end ? range.end : frame;
}

/** The scale that fits a composition in a box, keeping the aspect ratio. */
export function fitScale(
	boxWidth: number,
	boxHeight: number,
	compositionWidth: number,
	compositionHeight: number,
): number {
	if (boxWidth <= 0 || boxHeight <= 0) return 1;
	return Math.min(boxWidth / compositionWidth, boxHeight / compositionHeight);
}
