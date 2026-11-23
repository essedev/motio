// Prop checks of the motion blur components, in the order of the published @remotion/motion-blur
// (recorded in __oracle__/markup.json). The messages are Motio's own.

const show = (value: unknown) =>
	typeof value === "string" ? JSON.stringify(value) : String(value);

/** Throws unless `value` is a finite number. */
export function checkNumber(name: string, value: unknown): asserts value is number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new TypeError(`${name} is ${show(value)}: pass a finite number.`);
	}
}

/** Throws unless `value` is a finite, non-negative integer. */
export function checkCount(name: string, value: unknown): asserts value is number {
	checkNumber(name, value);
	if (!Number.isInteger(value)) {
		throw new TypeError(`${name} is ${value}: pass a whole number.`);
	}
	if (value < 0) {
		throw new TypeError(`${name} is ${value}: pass 0 or more.`);
	}
}
