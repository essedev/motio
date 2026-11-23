/** `volume`: a linear factor, or a function of the frame since the media started. */
export type VolumeProp = number | ((frame: number) => number);

/** How a `volume` callback counts frames inside a loop. */
export type LoopVolumeCurveBehavior = "repeat" | "extend";

/** Throws unless `volume` is a non-negative number or a function. */
export function validateVolumeProp(volume: unknown, component: string): void {
	if (volume === undefined || typeof volume === "function") return;
	if (typeof volume !== "number" || !Number.isFinite(volume) || volume < 0) {
		throw new TypeError(
			`<${component}>: "volume" must be a non-negative number or a function, got ${String(volume)}.`,
		);
	}
}

/**
 * Evaluates `volume` on one frame. A callback receives the frames elapsed since the media
 * started, on its parent's timeline; inside a loop it restarts at 0 on every iteration
 * (`"repeat"`, the default) or keeps counting (`"extend"`).
 */
export function evaluateVolume(
	volume: VolumeProp | undefined,
	frame: { inIteration: number; total: number },
	behavior: LoopVolumeCurveBehavior,
	component: string,
): number {
	if (volume === undefined) return 1;
	if (typeof volume === "number") return volume;
	const value = volume(behavior === "extend" ? frame.total : frame.inIteration);
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw new TypeError(
			`<${component}>: the "volume" function must return a non-negative number, got ${String(value)}.`,
		);
	}
	return value;
}

/** Throws unless `toneFrequency` is a number from 0.01 to 2. */
export function validateToneFrequency(value: unknown, component: string): void {
	if (value === undefined) return;
	if (typeof value !== "number" || !(value >= 0.01 && value <= 2)) {
		throw new TypeError(
			`<${component}>: "toneFrequency" must be a number from 0.01 to 2, got ${String(value)}.`,
		);
	}
}

/** Throws unless `audioStreamIndex` is a non-negative integer. */
export function validateAudioStreamIndex(value: unknown, component: string): void {
	if (value === undefined || value === null) return;
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
		throw new TypeError(
			`<${component}>: "audioStreamIndex" must be a non-negative integer, got ${String(value)}.`,
		);
	}
}

/** Throws unless `acceptableTimeShiftInSeconds` is a positive number. */
export function validateTimeShift(value: unknown, component: string): void {
	if (value === undefined) return;
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		throw new TypeError(
			`<${component}>: "acceptableTimeShiftInSeconds" must be a positive number, got ${String(value)}.`,
		);
	}
}
