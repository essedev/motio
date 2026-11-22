import { describe, expect, it } from "vitest";
import { decode, type Encoded } from "./__oracle__/fixtures.js";
import fixture from "./__oracle__/random.json" with { type: "json" };
import { random } from "./random.js";

type RandomCase =
	| { kind: "number"; seeds: Encoded[]; out: Encoded[] }
	| { kind: "string"; seeds: string[]; out: Encoded[] }
	| { kind: "codeUnits"; seeds: number[][]; out: Encoded[] }
	| { kind: "invalid"; seedType: string; error: string };

const cases = fixture.cases as RandomCase[];

const invalidSeeds: Record<string, unknown> = {
	undefined: undefined,
	object: {},
	array: [],
	boolean: true,
	function: () => 1,
};

// Tolerance: none. The generator is reproduced exactly, so every value must be
// bit-identical.
describe("random against the Remotion oracle", () => {
	it("is bit-identical for every number seed", () => {
		const c = cases.find((x) => x.kind === "number");
		if (c?.kind !== "number") throw new Error("missing number cases");
		expect(c.seeds.length).toBeGreaterThan(3000);
		const actual = c.seeds.map((s) => random(decode(s)));
		expect(actual).toEqual(c.out.map(decode));
	});

	it("is bit-identical for every string seed", () => {
		const c = cases.find((x) => x.kind === "string");
		if (c?.kind !== "string") throw new Error("missing string cases");
		expect(c.seeds.length).toBeGreaterThan(2000);
		expect(c.seeds.map((s) => random(s))).toEqual(c.out.map(decode));
	});

	it("is bit-identical for strings with lone and paired surrogates", () => {
		const c = cases.find((x) => x.kind === "codeUnits");
		if (c?.kind !== "codeUnits") throw new Error("missing code unit cases");
		const actual = c.seeds.map((units) => random(String.fromCharCode(...units)));
		expect(actual).toEqual(c.out.map(decode));
	});

	it("throws the same error for invalid seeds", () => {
		for (const c of cases) {
			if (c.kind !== "invalid") continue;
			expect(() => random(invalidSeeds[c.seedType] as string)).toThrow(c.error);
		}
	});
});

describe("random", () => {
	it("returns the documented value for seed 1", () => {
		expect(random(1)).toBe(0.07301638228818774);
	});

	it("returns a fresh value in [0, 1) for a null seed", () => {
		const values = Array.from({ length: 20 }, () => random(null));
		for (const v of values) {
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
		expect(new Set(values).size).toBeGreaterThan(1);
	});
});
