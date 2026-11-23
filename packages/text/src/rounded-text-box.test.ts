import { describe, expect, it } from "vitest";
import oracle from "./__oracle__/rounded-text-box.json" with { type: "json" };
import { createRoundedTextBox } from "./rounded-text-box.js";

// The recorder writes NaN, the infinities and -0 as strings (tools/oracle-features/lib.mjs).
const SENTINELS = new Set(["NaN", "Infinity", "-Infinity", "-0"]);
const decode = (value: unknown): unknown => {
	if (typeof value === "string" && SENTINELS.has(value)) return Number(value);
	if (Array.isArray(value)) return value.map(decode);
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decode(v)]));
	}
	return value;
};

type Case = {
	input: unknown;
	out?: { d: string; boundingBox: unknown; instructions?: unknown };
	error?: string;
	errorType?: string;
};
const cases = (oracle.cases as Case[]).map((c) => ({ ...c, input: decode(c.input) }));

describe("createRoundedTextBox() against the published @remotion/rounded-text-box", () => {
	it(`returns the same path string for all ${cases.length} recorded inputs`, () => {
		let mismatches = 0;
		let first = "";
		for (const c of cases) {
			const got = createRoundedTextBox(c.input as never).d;
			if (got !== c.out?.d) {
				mismatches++;
				first ||= `${JSON.stringify(c.input)}\n  got      ${got}\n  expected ${c.out?.d}`;
			}
		}
		expect(mismatches, first).toBe(0);
	});

	it("returns the same bounding box and instructions", () => {
		for (const c of cases) {
			const got = createRoundedTextBox(c.input as never);
			const expected = decode(c.out) as NonNullable<Case["out"]>;
			expect(got.boundingBox, JSON.stringify(c.input)).toEqual(expected.boundingBox);
			if (expected.instructions) expect(got.instructions).toEqual(expected.instructions);
		}
	});

	it("covers the documented edge cases", () => {
		const empty = cases.find(
			(c) => (c.input as { textMeasurements: unknown[] }).textMeasurements.length === 0,
		);
		expect(empty?.out?.d).toBe("Z");
		expect(createRoundedTextBox(empty?.input as never).d).toBe("Z");
	});
});
