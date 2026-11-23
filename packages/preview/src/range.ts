/** The loop range of the Player: `null` ends mean the start or the end of the composition. */
export interface LoopRange {
	inFrame: number | null;
	outFrame: number | null;
}

/** No range: the whole composition. */
export const FULL_RANGE: LoopRange = { inFrame: null, outFrame: null };

/**
 * Sets the in point at `frame`. An out point at or before it is dropped, because the Player
 * needs `inFrame < outFrame`. Frame 0 as in point is the same as no in point.
 */
export function setInPoint(range: LoopRange, frame: number): LoopRange {
	const inFrame = frame <= 0 ? null : frame;
	const outFrame = range.outFrame !== null && range.outFrame <= frame ? null : range.outFrame;
	return { inFrame, outFrame };
}

/**
 * Sets the out point at `frame`. An in point at or after it is dropped. The last frame as out
 * point is the same as no out point.
 */
export function setOutPoint(range: LoopRange, frame: number, durationInFrames: number): LoopRange {
	const outFrame = frame >= durationInFrames - 1 ? null : frame;
	const inFrame = range.inFrame !== null && range.inFrame >= frame ? null : range.inFrame;
	return { inFrame, outFrame };
}

/** Drops points outside the composition, after its duration changed. */
export function fitRange(range: LoopRange, durationInFrames: number): LoopRange {
	const last = durationInFrames - 1;
	const inFrame = range.inFrame !== null && range.inFrame < last ? range.inFrame : null;
	const outFrame =
		range.outFrame !== null && range.outFrame < last && range.outFrame > (inFrame ?? 0)
			? range.outFrame
			: null;
	return { inFrame, outFrame };
}

/** First and last frame playback covers. */
export function rangeBounds(range: LoopRange, durationInFrames: number): [number, number] {
	return [range.inFrame ?? 0, range.outFrame ?? durationInFrames - 1];
}
