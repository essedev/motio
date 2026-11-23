// Oracle recordings write values JSON cannot hold (NaN, the infinities, undefined) as
// {"$": "NaN" | "Infinity" | "-Infinity" | "undefined"}. These helpers turn them back into values
// and write Motio's results the same way, so outputs compare as recorded JSON text, key order
// included.

const isMarker = (value: unknown): value is { $: string } =>
	typeof value === "object" &&
	value !== null &&
	!Array.isArray(value) &&
	Object.keys(value).length === 1 &&
	typeof (value as { $?: unknown }).$ === "string";

/** A recorded value with its markers replaced by the values they stand for. */
export function decodeRecorded(value: unknown): unknown {
	if (isMarker(value)) return value.$ === "undefined" ? undefined : Number(value.$);
	if (Array.isArray(value)) return value.map(decodeRecorded);
	if (typeof value === "object" && value !== null) {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decodeRecorded(v)]));
	}
	return value;
}

/** JSON text of `value` written as the recorders write it, markers included. */
export function encodeRecorded(value: unknown): string {
	return JSON.stringify(value, (_key, v: unknown) => {
		if (v === undefined) return { $: "undefined" };
		if (typeof v === "number" && !Number.isFinite(v)) return { $: String(v) };
		return v;
	});
}
