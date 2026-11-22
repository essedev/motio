import type { Concurrency, FrameRange } from "./values.js";

/** Type guard for one setter argument. */
export type Validator<T> = (value: unknown) => value is T;

export const isString = (value: unknown): value is string =>
	typeof value === "string" && value.length > 0;

export const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

export const isPositiveInteger = (value: unknown): value is number =>
	typeof value === "number" && Number.isInteger(value) && value > 0;

export const isNonNegativeInteger = (value: unknown): value is number =>
	typeof value === "number" && Number.isInteger(value) && value >= 0;

export const isPositiveNumber = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value) && value > 0;

export const oneOf =
	<T extends string>(values: readonly T[]): Validator<T> =>
	(value: unknown): value is T =>
		typeof value === "string" && (values as readonly string[]).includes(value);

export const nullable =
	<T>(validator: Validator<T>): Validator<T | null> =>
	(value: unknown): value is T | null =>
		value === null || validator(value);

export const isJpegQuality = (value: unknown): value is number =>
	typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;

/** Remotion accepts a scale above 0 and at most 16. */
export const isScale = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 16;

export const isConcurrency = (value: unknown): value is Concurrency =>
	isPositiveInteger(value) ||
	(typeof value === "string" && /^\d+(\.\d+)?%$/.test(value) && Number.parseFloat(value) > 0);

const isFrameRangeItem = (value: unknown): boolean =>
	isNonNegativeInteger(value) ||
	(Array.isArray(value) &&
		value.length === 2 &&
		isNonNegativeInteger(value[0]) &&
		(value[1] === null || (isNonNegativeInteger(value[1]) && value[1] >= value[0])));

export const isFrameRange = (value: unknown): value is FrameRange =>
	isFrameRangeItem(value) ||
	(Array.isArray(value) && value.length > 0 && value.every(isFrameRangeItem));

export const isStringRecord = (value: unknown): value is Record<string, string> =>
	typeof value === "object" &&
	value !== null &&
	!Array.isArray(value) &&
	Object.values(value).every((v) => typeof v === "string");

export const isFlagRecord = (value: unknown): value is Record<string, boolean | string> =>
	typeof value === "object" &&
	value !== null &&
	!Array.isArray(value) &&
	Object.values(value).every((v) => typeof v === "boolean" || typeof v === "string");

export const isBooleanRecord = (value: unknown): value is Record<string, boolean> =>
	typeof value === "object" &&
	value !== null &&
	!Array.isArray(value) &&
	Object.values(value).every((v) => typeof v === "boolean");

export const isCommaSeparatedIntegers = (value: unknown): value is string =>
	typeof value === "string" && /^\s*\d+(\s*,\s*\d+)*\s*$/.test(value);
