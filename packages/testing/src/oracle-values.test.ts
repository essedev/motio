import { describe, expect, it } from "vitest";
import { decodeRecorded, encodeRecorded } from "./oracle-values.js";

describe("oracle values", () => {
	it("round-trips the values JSON cannot hold", () => {
		const value = { a: Number.NaN, b: [undefined, Number.NEGATIVE_INFINITY], c: { d: 1 } };
		const text = encodeRecorded(value);
		expect(text).toBe('{"a":{"$":"NaN"},"b":[{"$":"undefined"},{"$":"-Infinity"}],"c":{"d":1}}');
		expect(decodeRecorded(JSON.parse(text))).toEqual(value);
	});

	it("leaves objects that only look like markers alone", () => {
		expect(decodeRecorded({ $: 1 })).toEqual({ $: 1 });
		expect(decodeRecorded({ $: "x", y: 1 })).toEqual({ $: "x", y: 1 });
	});
});
