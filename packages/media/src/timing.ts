/** Trim props shared by every media component, with their deprecated names. */
export interface MediaTrimProps {
	/** Source frames (at the composition's fps) removed from the start. Default 0. */
	trimBefore?: number;
	/**
	 * Source frame (at the composition's fps) where the media is cut. Deprecated: use
	 * `durationInFrames`.
	 */
	trimAfter?: number;
	/** Deprecated name of `trimBefore`; cannot be combined with it. */
	startFrom?: number;
	/** Deprecated name of `trimAfter`; cannot be combined with it. */
	endAt?: number;
	/** Source frames to show from `trimBefore`; the media lasts `durationInFrames / playbackRate`. */
	durationInFrames?: number;
}

/** The trim props resolved to the source range shown. */
export interface ResolvedTrim {
	/** First source frame shown, at the composition's fps. */
	trimBefore: number;
	/** Number of source frames shown from `trimBefore`, or `Infinity`. */
	durationInFrames: number;
}

function checkFrames(component: string, name: string, value: unknown): void {
	if (value === undefined) return;
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw new TypeError(
			`<${component}>: "${name}" must be a non-negative finite number of frames, got ${String(value)}.`,
		);
	}
}

/**
 * Resolves `trimBefore`, `trimAfter`, their deprecated names `startFrom` and `endAt`, and
 * `durationInFrames` to the source range shown. When `trimAfter` and `durationInFrames` both
 * limit the range, the shorter one wins.
 */
export function resolveTrim(
	props: { [K in keyof MediaTrimProps]?: MediaTrimProps[K] | undefined },
	component: string,
): ResolvedTrim {
	const { trimBefore, trimAfter, startFrom, endAt, durationInFrames } = props;
	if (startFrom !== undefined && trimBefore !== undefined) {
		throw new TypeError(
			`<${component}>: "startFrom" is the deprecated name of "trimBefore"; pass only "trimBefore".`,
		);
	}
	if (endAt !== undefined && trimAfter !== undefined) {
		throw new TypeError(
			`<${component}>: "endAt" is the deprecated name of "trimAfter"; pass only "trimAfter" (or better, "durationInFrames").`,
		);
	}
	checkFrames(component, "trimBefore", trimBefore);
	checkFrames(component, "startFrom", startFrom);
	checkFrames(component, "trimAfter", trimAfter);
	checkFrames(component, "endAt", endAt);
	if (
		durationInFrames !== undefined &&
		(typeof durationInFrames !== "number" ||
			Number.isNaN(durationInFrames) ||
			durationInFrames <= 0)
	) {
		throw new TypeError(
			`<${component}>: "durationInFrames" must be a positive number, got ${String(durationInFrames)}.`,
		);
	}
	const before = trimBefore ?? startFrom ?? 0;
	const after = trimAfter ?? endAt;
	if (after !== undefined && after <= before) {
		throw new TypeError(
			`<${component}>: "${trimAfter !== undefined ? "trimAfter" : "endAt"}" (${after}) must be greater than "${trimBefore !== undefined ? "trimBefore" : startFrom !== undefined ? "startFrom" : "trimBefore"}" (${before}).`,
		);
	}
	const fromAfter = after === undefined ? Number.POSITIVE_INFINITY : after - before;
	return {
		trimBefore: before,
		durationInFrames: Math.min(durationInFrames ?? Number.POSITIVE_INFINITY, fromAfter),
	};
}

/**
 * Length of one loop iteration in composition frames: the selected range when finite, else the
 * rest of the media after `trimBefore`, rounded down to whole frames as in Remotion's own looping
 * recipe for `<OffthreadVideo>`. Null while the media duration is unknown.
 */
export function loopLength(
	trim: ResolvedTrim,
	mediaDurationInSeconds: number | null,
	fps: number,
): number | null {
	if (Number.isFinite(trim.durationInFrames)) return trim.durationInFrames;
	if (mediaDurationInSeconds === null || !(mediaDurationInSeconds > 0)) return null;
	const frames = Math.floor(mediaDurationInSeconds * fps + 1e-6) - trim.trimBefore;
	return frames > 0 ? frames : null;
}
