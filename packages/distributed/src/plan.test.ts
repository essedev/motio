import { describe, expect, it } from "vitest";
import { planChunks } from "./plan.js";

const covers = (chunks: { start: number; end: number }[], first: number, last: number) => {
	let next = first;
	for (const c of chunks) {
		expect(c.start).toBe(next);
		expect(c.end).toBeGreaterThanOrEqual(c.start);
		next = c.end + 1;
	}
	expect(next).toBe(last + 1);
};

describe("planChunks", () => {
	it("covers the range exactly once with fixed-size chunks", () => {
		const chunks = planChunks({ frameRange: [0, 99], framesPerChunk: 30 });
		expect(chunks.map((c) => [c.start, c.end])).toEqual([
			[0, 29],
			[30, 59],
			[60, 89],
			[90, 99],
		]);
		covers(chunks, 0, 99);
	});
	it("splits into a number of chunks", () => {
		const chunks = planChunks({ frameRange: [10, 109], chunks: 3 });
		expect(chunks).toHaveLength(3);
		covers(chunks, 10, 109);
	});
	it("aligns chunk sizes to the GOP", () => {
		const chunks = planChunks({ frameRange: [0, 100], framesPerChunk: 25, alignTo: 12 });
		expect(
			chunks.every((c, i) => i === chunks.length - 1 || (c.end - c.start + 1) % 12 === 0),
		).toBe(true);
		covers(chunks, 0, 100);
	});
	it("handles a single frame", () =>
		expect(planChunks({ frameRange: [5, 5], chunks: 4 })).toEqual([
			{ index: 0, start: 5, end: 5 },
		]));
	it("rejects invalid input", () => {
		expect(() => planChunks({ frameRange: [5, 4], chunks: 1 })).toThrow(/invalid frame range/);
		expect(() => planChunks({ frameRange: [0, 9] })).toThrow(/exactly one/);
		expect(() => planChunks({ frameRange: [0, 9], chunks: 2, framesPerChunk: 3 })).toThrow(
			/exactly one/,
		);
		expect(() => planChunks({ frameRange: [0, 9], framesPerChunk: 0 })).toThrow(/positive integer/);
	});
});
