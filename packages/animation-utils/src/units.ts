// Units and argument checks of the transform builders. The lists, their order and the messages
// are what the published @remotion/animation-utils reports (recorded in
// __oracle__/transforms.json); the checks reproduce its observed acceptance, quirks included.

/** Length units the transform builders accept in strings, in Remotion's order. */
export const LENGTH_UNITS = [
	"px",
	"em",
	"rem",
	"pt",
	"cap",
	"ch",
	"ex",
	"ic",
	"lh",
	"rlh",
	"vmax",
	"vmin",
	"vb",
	"vi",
	"cqw",
	"vh",
	"vw",
	"cqh",
	"cqi",
	"cqb",
	"cqmin",
	"cqmax",
	"cm",
	"mm",
	"Q",
	"in",
	"pc",
] as const;

/** Length units plus `%`. */
export const LENGTH_PERCENTAGE_UNITS = ["%", ...LENGTH_UNITS] as const;

/** Angle units. */
export const ANGLE_UNITS = ["rad", "deg", "grad", "turn"] as const;

/** A CSS length unit. */
export type LengthUnit = (typeof LENGTH_UNITS)[number];
/** A CSS length unit or `%`. */
export type LengthPercentageUnit = (typeof LENGTH_PERCENTAGE_UNITS)[number];
/** A CSS angle unit. */
export type AngleUnit = (typeof ANGLE_UNITS)[number];
/** A number followed by a length unit, such as `"12rem"`. */
export type LengthUnitString = `${number}${LengthUnit}`;
/** A number followed by a length unit or `%`, such as `"50%"`. */
export type LengthPercentageUnitString = `${number}${LengthPercentageUnit}`;
/** A number followed by an angle unit, such as `"45deg"`. */
export type AngleUnitString = `${number}${AngleUnit}`;

/** Throws unless `value` is a finite number; names the function and the parameter. */
export function checkNumber(fn: string, param: string, value: unknown): asserts value is number {
	if (typeof value !== "number") {
		throw new TypeError(`${fn}(): ${param} is ${JSON.stringify(value)}, not a number.`);
	}
	if (!Number.isFinite(value)) {
		throw new TypeError(`${fn}(): ${param} is ${value}: it must be a finite number.`);
	}
}

/**
 * Throws unless `value` ends with one of `units` and contains a digit or a dot directly followed
 * by a lowercase letter or `%` (anywhere: `"x10px"` and `"1eQ"` pass, `"10Q"` and `"10 px"` do
 * not).
 */
export function checkUnitString(value: string, units: readonly string[]): void {
	if (!units.some((unit) => value.endsWith(unit))) {
		throw new Error(
			`"${value}" does not end with an accepted unit: use one of ${units.join(", ")}.`,
		);
	}
	if (!/[0-9.][a-z%]/.test(value)) {
		throw new Error(
			`"${value}" has no number before its unit: write a number followed by the unit, such as "10px" or "45deg".`,
		);
	}
}

/** A value that is a unit string (checked against `units`) or a finite number. */
export function checkValue(
	fn: string,
	param: string,
	value: unknown,
	units: readonly string[],
): asserts value is string | number {
	if (typeof value === "string") checkUnitString(value, units);
	else checkNumber(fn, param, value);
}

/** The error of a call that matches none of a function's forms, described by `forms`. */
export function signatureError(fn: string, forms: string): TypeError {
	return new TypeError(`${fn}() does not accept these arguments. Call it with ${forms}.`);
}
