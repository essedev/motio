// Prop checks of the motion blur components, with the messages and the order of the published
// @remotion/motion-blur (recorded in __oracle__/markup.json).

/** Throws unless `value` is a finite number. */
export function checkNumber(name: string, value: unknown): asserts value is number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new TypeError(`"${name}" must be a number, but got ${JSON.stringify(value)}`);
	}
}

/** Throws unless `value` is a finite, non-negative integer. */
export function checkCount(name: string, value: unknown): asserts value is number {
	checkNumber(name, value);
	if (!Number.isInteger(value)) {
		throw new TypeError(`"${name}" must be an integer, but got ${JSON.stringify(value)}`);
	}
	if (value < 0) {
		throw new TypeError(`"${name}" must be non-negative, but got ${JSON.stringify(value)}`);
	}
}
