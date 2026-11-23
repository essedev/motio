import { describe, expect, it } from "vitest";
import {
	compare,
	criterionFailures,
	formatTable,
	median,
	parseSamples,
	type Sample,
	summarise,
} from "./stats.ts";

const s = (side: Sample["side"], composition: string, concurrency: number, ms: number): Sample => ({
	side,
	composition,
	concurrency,
	frames: 60,
	ms,
});

describe("median", () => {
	it("takes the middle value, or the mean of the two middle values", () => {
		expect(median([3, 1, 2])).toBe(2);
		expect(median([4, 1, 3, 2])).toBe(2.5);
		expect(() => median([])).toThrow(RangeError);
	});
});

describe("summarise", () => {
	it("sums the per-composition medians and derives fps from every frame", () => {
		const rows = summarise(
			[
				s("motio", "motion", 4, 1000),
				s("motio", "motion", 4, 3000),
				s("motio", "motion", 4, 1200),
				s("motio", "timeline", 4, 800),
				s("motio", "timeline", 4, 900),
				s("remotion", "motion", 4, 1),
			],
			"motio",
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.byComposition).toEqual({ motion: 1200, timeline: 850 });
		expect(rows[0]?.totalMs).toBe(2050);
		expect(rows[0]?.fps).toBeCloseTo(120 / 2.05);
		expect(rows[0]?.runs).toBe(2);
	});
});

describe("compare and criterionFailures", () => {
	const samples = [
		s("remotion", "motion", 1, 3000),
		s("motio", "motion", 1, 2900),
		s("remotion", "motion", 8, 1000),
		s("motio", "motion", 8, 1100),
		s("remotion", "motion", 4, 1000),
	];

	it("pairs both sides by concurrency and flags slower or missing cases", () => {
		const rows = compare(samples);
		expect(rows.map((r) => r.concurrency)).toEqual([1, 4, 8]);
		expect(rows[0]?.ratio).toBeCloseTo(2900 / 3000);
		expect(rows[1]?.ratio).toBeNull();
		expect(criterionFailures(rows)).toEqual([4, 8]);
	});

	it("formats one Markdown row per concurrency", () => {
		const table = formatTable(compare(samples)).split("\n");
		expect(table).toHaveLength(5);
		expect(table[2]).toBe("| 1 | 3.00 s | 2.90 s | 20.0 | 20.7 | 0.97 |");
		expect(table[3]).toContain("| 4 | 1.00 s | - |");
	});
});

describe("parseSamples", () => {
	it("keeps well-formed sample lines and skips logs", () => {
		const out = [
			"Bundling...",
			JSON.stringify(s("remotion", "motion", 1, 10)),
			"{not json",
			JSON.stringify({ side: "other", composition: "x", concurrency: 1, frames: 1, ms: 1 }),
		].join("\n");
		expect(parseSamples(out)).toEqual([s("remotion", "motion", 1, 10)]);
	});
});
