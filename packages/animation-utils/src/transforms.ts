// Builders of CSS transform functions, as in @remotion/animation-utils: numbers get a default
// unit (`px` for lengths, `deg` for angles), unit strings are checked and passed through, and a
// unit argument is appended as given. Argument checks and messages match the published package
// over the grid in __oracle__/transforms.json.
import {
	ANGLE_UNITS,
	type AngleUnit,
	type AngleUnitString,
	checkNumber,
	checkUnitString,
	checkValue,
	LENGTH_PERCENTAGE_UNITS,
	LENGTH_UNITS,
	type LengthPercentageUnit,
	type LengthPercentageUnitString,
	type LengthUnit,
	type LengthUnitString,
	signatureError,
} from "./units.js";

const TRANSLATE_FORMS =
	'one length (a string such as "10px", or a number of pixels), two of them, a number and its unit, or two numbers each followed by its unit';

const SKEW_FORMS =
	'one or two angles (strings such as "10deg"), a number and its angle unit, two numbers, or two numbers each followed by its angle unit';

const TRANSLATE_3D_FORMS =
	'three lengths (strings such as "10px", or numbers of pixels), or three numbers each followed by its unit';

const MATRIX_PARAMS = ["a", "b", "c", "d", "tx", "ty"] as const;

const MATRIX_3D_PARAMS = [
	"a1",
	"b1",
	"c1",
	"d1",
	"a2",
	"b2",
	"c2",
	"d2",
	"a3",
	"b3",
	"c3",
	"d3",
	"a4",
	"b4",
	"c4",
	"d4",
] as const;

/** `matrix(a, b, c, d, e, f)`. */
export function matrix(a: number, b: number, c: number, d: number, e: number, f: number): string {
	const values = [a, b, c, d, e, f];
	values.forEach((value, i) => {
		checkNumber("matrix", MATRIX_PARAMS[i] as string, value);
	});
	return `matrix(${values.join(", ")})`;
}

/** `matrix3d()` from its 16 values, column by column (`a1, b1, c1, d1, a2, ...`). */
export function matrix3d(
	a1: number,
	b1: number,
	c1: number,
	d1: number,
	a2: number,
	b2: number,
	c2: number,
	d2: number,
	a3: number,
	b3: number,
	c3: number,
	d3: number,
	a4: number,
	b4: number,
	c4: number,
	d4: number,
): string {
	const values = [a1, b1, c1, d1, a2, b2, c2, d2, a3, b3, c3, d3, a4, b4, c4, d4];
	values.forEach((value, i) => {
		checkNumber("matrix3d", MATRIX_3D_PARAMS[i] as string, value);
	});
	return `matrix3d(${values.join(", ")})`;
}

/** `perspective()`: a number in `unit` (default `px`) or a length string. */
export function perspective(length: LengthUnitString): string;
export function perspective(length: number, unit?: LengthUnit): string;
export function perspective(length: number | string, unit: string = "px"): string {
	if (typeof length === "string") {
		checkUnitString(length, LENGTH_UNITS);
		return `perspective(${length})`;
	}
	checkNumber("perspective", "length", length);
	return `perspective(${length}${unit})`;
}

const isAngleUnit = (value: unknown): value is AngleUnit =>
	(ANGLE_UNITS as readonly unknown[]).includes(value);

const angleFunction =
	(name: string) =>
	(angle: number | string, unit: string = "deg"): string => {
		if (typeof angle === "string") {
			checkUnitString(angle, ANGLE_UNITS);
			return `${name}(${angle})`;
		}
		checkNumber(name, "angle", angle);
		return `${name}(${angle}${unit})`;
	};

/** An angle transform: a number in `unit` (default `deg`) or an angle string. */
export interface AngleTransform {
	(angle: AngleUnitString): string;
	(angle: number, unit?: AngleUnit): string;
}

/** `rotate()`. */
export const rotate: AngleTransform = angleFunction("rotate");
/** `rotateX()`. */
export const rotateX: AngleTransform = angleFunction("rotateX");
/** `rotateY()`. */
export const rotateY: AngleTransform = angleFunction("rotateY");
/** `rotateZ()`. */
export const rotateZ: AngleTransform = angleFunction("rotateZ");
/** `skewX()`. */
export const skewX: AngleTransform = angleFunction("skewX");
/** `skewY()`. */
export const skewY: AngleTransform = angleFunction("skewY");

/** `rotate3d(x, y, z, angle)`: the angle a number in `unit` (default `deg`) or an angle string. */
export function rotate3d(x: number, y: number, z: number, angle: AngleUnitString): string;
export function rotate3d(x: number, y: number, z: number, angle: number, unit?: AngleUnit): string;
export function rotate3d(
	x: number,
	y: number,
	z: number,
	angle: number | string,
	unit: string = "deg",
): string {
	checkNumber("rotate3d", "x", x);
	checkNumber("rotate3d", "y", y);
	checkNumber("rotate3d", "z", z);
	if (typeof angle === "string") {
		checkUnitString(angle, ANGLE_UNITS);
		return `rotate3d(${x}, ${y}, ${z}, ${angle})`;
	}
	checkNumber("rotate3d", "angle", angle);
	return `rotate3d(${x}, ${y}, ${z}, ${angle}${unit})`;
}

/** `scale(x, y)`; `y` defaults to `x`. */
export function scale(x: number, y: number = x): string {
	checkNumber("scale", "x", x);
	checkNumber("scale", "y", y);
	return `scale(${x}, ${y})`;
}

/** `scale3d(x, y, z)`. */
export function scale3d(x: number, y: number, z: number): string {
	checkNumber("scale3d", "x", x);
	checkNumber("scale3d", "y", y);
	checkNumber("scale3d", "z", z);
	return `scale3d(${x}, ${y}, ${z})`;
}

/** `scaleX()`. */
export function scaleX(x: number): string {
	checkNumber("scaleX", "x", x);
	return `scaleX(${x})`;
}

/** `scaleY()`. */
export function scaleY(y: number): string {
	checkNumber("scaleY", "y", y);
	return `scaleY(${y})`;
}

/** `scaleZ()`. */
export function scaleZ(z: number): string {
	checkNumber("scaleZ", "z", z);
	return `scaleZ(${z})`;
}

/**
 * `skew()`: one angle for both axes (a string, or a number in degrees or in `unit`), two
 * angles, or two numbers with their units.
 */
export function skew(angle: AngleUnitString): string;
export function skew(angle: AngleUnitString, angle2: AngleUnitString): string;
export function skew(angle: number, unit: AngleUnit): string;
export function skew(angleX: number, angleY?: number): string;
export function skew(angleX: number, unitX: AngleUnit, angleY: number, unitY: AngleUnit): string;
export function skew(...args: unknown[]): string {
	const [a, b, c, d] = args;
	if (args.length === 1) {
		if (typeof a === "string") {
			checkUnitString(a, ANGLE_UNITS);
			return `skew(${a}, ${a})`;
		}
		checkNumber("skew", "angle", a);
		return `skew(${a}deg, ${a}deg)`;
	}
	if (args.length === 2) {
		if (typeof a === "number" && typeof b === "number") {
			checkNumber("skew", "angle", a);
			checkNumber("skew", "angle", b);
			return `skew(${a}deg, ${b}deg)`;
		}
		if (typeof a === "number") {
			checkNumber("skew", "angle", a);
			return `skew(${a}${String(b)}, ${a}${String(b)})`;
		}
		if (typeof a === "string") {
			checkUnitString(a, ANGLE_UNITS);
			if (typeof b === "string") {
				checkUnitString(b, ANGLE_UNITS);
				return `skew(${a}, ${b})`;
			}
		}
	}
	// Unlike translate(), the four-argument form needs real angle units.
	if (
		args.length === 4 &&
		typeof a === "number" &&
		typeof c === "number" &&
		isAngleUnit(b) &&
		isAngleUnit(d)
	) {
		checkNumber("skew", "angle", a);
		checkNumber("skew", "angle", c);
		return `skew(${a}${b}, ${c}${d})`;
	}
	throw signatureError("skew", SKEW_FORMS);
}

/**
 * `translate()`: one length (a string, or a number in pixels or in `unit`), two lengths, or two
 * numbers with their units.
 */
export function translate(x: LengthPercentageUnitString): string;
export function translate(x: LengthPercentageUnitString, y: LengthPercentageUnitString): string;
export function translate(x: number, y?: number): string;
export function translate(translation: number, unit: LengthPercentageUnit): string;
export function translate(
	x: number,
	unitX: LengthPercentageUnit,
	y: number,
	unitY: LengthPercentageUnit,
): string;
export function translate(...args: unknown[]): string {
	const [a, b, c, d] = args;
	if (args.length === 1) {
		if (typeof a === "string") {
			checkUnitString(a, LENGTH_PERCENTAGE_UNITS);
			return `translate(${a})`;
		}
		checkNumber("translate", "x", a);
		return `translate(${a}px)`;
	}
	if (args.length === 2) {
		if (typeof a === "number" && typeof b === "number") {
			checkNumber("translate", "x", a);
			checkNumber("translate", "y", b);
			return `translate(${a}px, ${b}px)`;
		}
		if (typeof a === "number") {
			checkNumber("translate", "x", a);
			return `translate(${a}${String(b)})`;
		}
		if (typeof a === "string") {
			checkUnitString(a, LENGTH_PERCENTAGE_UNITS);
			if (typeof b === "string") {
				checkUnitString(b, LENGTH_PERCENTAGE_UNITS);
				return `translate(${a}, ${b})`;
			}
		}
	}
	if (args.length === 4 && typeof a === "number" && typeof c === "number") {
		checkNumber("translate", "x", a);
		checkNumber("translate", "y", c);
		return `translate(${a}${String(b)}, ${c}${String(d)})`;
	}
	throw signatureError("translate", TRANSLATE_FORMS);
}

/** `translate3d()`: three lengths (strings or numbers in pixels), or three numbers with units. */
export function translate3d(
	x: LengthPercentageUnitString | number,
	y: LengthPercentageUnitString | number,
	z: LengthPercentageUnitString | number,
): string;
export function translate3d(
	x: number,
	unitX: LengthPercentageUnit,
	y: number,
	unitY: LengthPercentageUnit,
	z: number,
	unitZ: LengthUnit,
): string;
export function translate3d(...args: unknown[]): string {
	if (args.length === 3) {
		const parts = (["x", "y", "z"] as const).map((param, i) => {
			const value = args[i];
			checkValue("translate3d", param, value, LENGTH_PERCENTAGE_UNITS);
			return typeof value === "string" ? value : `${value}px`;
		});
		return `translate3d(${parts.join(", ")})`;
	}
	const [x, unitX, y, unitY, z, unitZ] = args;
	if (
		args.length === 6 &&
		typeof x === "number" &&
		typeof y === "number" &&
		typeof z === "number"
	) {
		checkNumber("translate3d", "x", x);
		checkNumber("translate3d", "y", y);
		checkNumber("translate3d", "z", z);
		return `translate3d(${x}${String(unitX)}, ${y}${String(unitY)}, ${z}${String(unitZ)})`;
	}
	throw signatureError("translate3d", TRANSLATE_3D_FORMS);
}

const lengthFunction =
	(name: string, param: string, units: readonly string[]) =>
	(value: number | string, unit: string = "px"): string => {
		if (typeof value === "string") {
			checkUnitString(value, units);
			return `${name}(${value})`;
		}
		checkNumber(name, param, value);
		return `${name}(${value}${unit})`;
	};

/** A length transform: a number in `unit` (default `px`) or a length string. */
export interface LengthTransform<S extends string, U extends string> {
	(value: S): string;
	(value: number, unit?: U): string;
}

/** `translateX()`. */
export const translateX: LengthTransform<LengthPercentageUnitString, LengthPercentageUnit> =
	lengthFunction("translateX", "x", LENGTH_PERCENTAGE_UNITS);
/** `translateY()`. */
export const translateY: LengthTransform<LengthPercentageUnitString, LengthPercentageUnit> =
	lengthFunction("translateY", "y", LENGTH_PERCENTAGE_UNITS);
/** `translateZ()`: lengths only, no percentages in strings. */
export const translateZ: LengthTransform<LengthUnitString, LengthUnit> = lengthFunction(
	"translateZ",
	"z",
	LENGTH_UNITS,
);
