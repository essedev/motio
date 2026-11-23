const describe = (value: unknown) =>
	typeof value === "string" ? JSON.stringify(value) : String(value);

/** The validated options of a light leak. */
export interface LightLeakParams {
	/** Shape of the pattern; any finite number. */
	seed: number;
	/** Hue rotation in degrees, from 0 to 360. */
	hueShift: number;
}

/**
 * Checks `seed`, then `hueShift`, then `durationInFrames` in the order Remotion does: a
 * `TypeError` for a value that is not a finite number (or a duration that is not a positive
 * number), a `RangeError` for a hue shift outside 0 to 360. A `NaN` or infinite duration passes,
 * as in Remotion.
 */
export function resolveLightLeak(
	input: { seed?: unknown; hueShift?: unknown; durationInFrames?: unknown },
	component = "<LightLeak>",
): LightLeakParams {
	const seed = input.seed ?? 0;
	if (typeof seed !== "number" || !Number.isFinite(seed)) {
		throw new TypeError(`${component}: "seed" is ${describe(seed)}; pass a finite number.`);
	}
	const hueShift = input.hueShift ?? 0;
	if (typeof hueShift !== "number" || !Number.isFinite(hueShift)) {
		throw new TypeError(
			`${component}: "hueShift" is ${describe(hueShift)}; pass a finite number of degrees.`,
		);
	}
	if (hueShift < 0 || hueShift > 360) {
		throw new RangeError(
			`${component}: "hueShift" is ${hueShift}; pass a number of degrees from 0 to 360.`,
		);
	}
	const { durationInFrames } = input;
	if (durationInFrames !== undefined) {
		if (typeof durationInFrames !== "number") {
			throw new TypeError(
				`${component}: "durationInFrames" is ${describe(durationInFrames)}; pass a number of frames.`,
			);
		}
		if (durationInFrames <= 0) {
			throw new TypeError(
				`${component}: "durationInFrames" is ${durationInFrames}; pass a positive number of frames.`,
			);
		}
	}
	return { seed, hueShift };
}

/**
 * Progress of the leak at a frame of its sequence: 0 on the first frame, 1 on the last, so it
 * reveals over the first half and retracts over the second. A one-frame leak is at its peak.
 */
export function lightLeakProgress(frame: number, durationInFrames: number): number {
	if (!(durationInFrames > 1) || !Number.isFinite(durationInFrames)) return 0.5;
	return Math.min(1, Math.max(0, frame / (durationInFrames - 1)));
}
