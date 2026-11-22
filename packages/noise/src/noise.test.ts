import { describe, expect, it } from "vitest";
import { decode, type Encoded } from "./__oracle__/fixtures.js";
import fixture from "./__oracle__/noise.json" with { type: "json" };
import { noise2D, noise3D, noise4D } from "./noise.js";

type NoiseCase = {
	fn: "noise2D" | "noise3D" | "noise4D";
	seed: string | number;
	points: Encoded[][];
	out: Encoded[];
};

const call = (c: NoiseCase, p: number[]): number => {
	const [x = 0, y = 0, z = 0, w = 0] = p;
	if (c.fn === "noise2D") return noise2D(c.seed, x, y);
	if (c.fn === "noise3D") return noise3D(c.seed, x, y, z);
	return noise4D(c.seed, x, y, z, w);
};

describe("noise against the Remotion oracle", () => {
	// Exact: the same simplex-noise build and the same seeded generator give
	// bit-identical permutation tables, hence bit-identical samples.
	it("matches every sample exactly", () => {
		let count = 0;
		for (const c of fixture.cases as NoiseCase[]) {
			c.points.forEach((p, i) => {
				const expected = decode(c.out[i] as Encoded);
				expect(call(c, p.map(decode)), `${c.fn}(${JSON.stringify(c.seed)}, ${p})`).toBe(expected);
				count++;
			});
		}
		expect(count).toBeGreaterThan(4000);
	});
});

describe("noise", () => {
	it("stays in [-1, 1] and is deterministic per seed", () => {
		for (let i = 0; i < 200; i++) {
			const v = noise3D("range", i * 0.37, i * -0.11, i * 0.05);
			expect(v).toBeGreaterThanOrEqual(-1);
			expect(v).toBeLessThanOrEqual(1);
			expect(noise3D("range", i * 0.37, i * -0.11, i * 0.05)).toBe(v);
		}
	});

	it("gives different fields for different seeds", () => {
		expect(noise2D("a", 1.5, 2.5)).not.toBe(noise2D("b", 1.5, 2.5));
	});

	it("survives more seeds than the cache holds", () => {
		const first = noise2D(0, 0.3, 0.7);
		for (let seed = 1; seed < 600; seed++) noise2D(seed, 0.3, 0.7);
		expect(noise2D(0, 0.3, 0.7)).toBe(first);
	});
});
