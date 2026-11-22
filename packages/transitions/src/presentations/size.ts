/** Throws unless `width` and `height` are positive finite numbers. */
export function validateSize(fn: string, width: unknown, height: unknown): void {
	for (const [key, value] of [
		["width", width],
		["height", height],
	] as const) {
		if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
			throw new TypeError(
				`${fn}(): "${key}" must be a positive number (the ${key} of the video, from useVideoConfig()), got ${String(value)}.`,
			);
		}
	}
}
