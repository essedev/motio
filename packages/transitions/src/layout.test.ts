import { describe, expect, it } from "vitest";
import { type LayoutItem, layoutTransitionSeries } from "./layout.js";
import { fade } from "./presentations/fade.js";
import { linearTiming } from "./timings/linear-timing.js";
import { springTiming } from "./timings/spring-timing.js";

const seq = (durationInFrames: number, extra: Partial<LayoutItem> = {}): LayoutItem =>
	({ kind: "sequence", durationInFrames, ...extra }) as LayoutItem;
const tr = (durationInFrames: number): LayoutItem => ({
	kind: "transition",
	timing: linearTiming({ durationInFrames }),
	presentation: fade(),
});
const overlay = (durationInFrames: number, offset?: number): LayoutItem => ({
	kind: "overlay",
	durationInFrames,
	offset,
});

describe("layoutTransitionSeries()", () => {
	it("places the features fixture: 7 scenes of 30, five 10-frame transitions and a 12-frame spring", () => {
		const items: LayoutItem[] = [
			seq(30),
			tr(10),
			seq(30),
			{
				kind: "transition",
				timing: springTiming({ config: { damping: 200 }, durationInFrames: 12 }),
				presentation: fade(),
			},
			seq(30),
			tr(10),
			seq(30),
			tr(10),
			seq(30),
			tr(10),
			seq(30),
			tr(10),
			seq(30),
		];
		const layout = layoutTransitionSeries(items, 30);
		expect(layout.sequences.map((s) => s.from)).toEqual([0, 20, 38, 58, 78, 98, 118]);
		// 7 * 30 - (5 * 10 + 12): the composition is 148 frames long.
		expect(layout.durationInFrames).toBe(148);
		const [a, b, c] = layout.sequences;
		expect(a?.enter).toBeNull();
		expect(a?.exit).toMatchObject({ start: 20, durationInFrames: 10 });
		expect(b?.enter).toMatchObject({ start: 20, durationInFrames: 10 });
		expect(b?.exit).toMatchObject({ start: 38, durationInFrames: 12 });
		expect(c?.enter).toMatchObject({ start: 38, durationInFrames: 12 });
	});

	it("subtracts transitions from the total (docs: 40 + 60 - 30 = 70; 40 + 60 + 90 - 30 - 45 = 115)", () => {
		expect(layoutTransitionSeries([seq(40), tr(30), seq(60)], 30).durationInFrames).toBe(70);
		expect(
			layoutTransitionSeries([seq(40), tr(30), seq(60), tr(45), seq(90)], 30).durationInFrames,
		).toBe(115);
	});

	it("animates an entrance or exit with a transition first or last, without moving the scene", () => {
		const layout = layoutTransitionSeries([tr(10), seq(40), tr(30)], 30);
		expect(layout.durationInFrames).toBe(40);
		expect(layout.sequences[0]).toMatchObject({
			from: 0,
			enter: { start: 0, durationInFrames: 10 },
			exit: { start: 10, durationInFrames: 30 },
		});
	});

	it("applies offsets like <Series.Sequence> and playback rates to the length", () => {
		const layout = layoutTransitionSeries(
			[seq(30), seq(30, { offset: 5 }), tr(10), seq(40, { playbackRate: 2 })],
			30,
		);
		expect(layout.sequences.map((s) => [s.from, s.length])).toEqual([
			[0, 30],
			[35, 30],
			[55, 20],
		]);
		expect(layout.durationInFrames).toBe(75);
	});

	it("centres an overlay on the cut without shortening the series", () => {
		const layout = layoutTransitionSeries([seq(60), overlay(20), seq(60)], 30);
		expect(layout.durationInFrames).toBe(120);
		expect(layout.sequences.map((s) => s.from)).toEqual([0, 60]);
		expect(layout.overlays).toEqual([{ index: 1, from: 50, durationInFrames: 20 }]);
		expect(layoutTransitionSeries([seq(60), overlay(20, 7), seq(60)], 30).overlays[0]?.from).toBe(
			57,
		);
	});

	it("rejects an overlay that leaves its adjacent sequences", () => {
		expect(() => layoutTransitionSeries([overlay(20), seq(60)], 30)).toThrow(
			/outside of its adjacent sequences/,
		);
		expect(() => layoutTransitionSeries([seq(60), overlay(20, 60), seq(60)], 30)).toThrow(
			/outside of its adjacent sequences/,
		);
		expect(layoutTransitionSeries([overlay(20, 10), seq(60)], 30).overlays[0]?.from).toBe(0);
	});

	it("enforces the documented rules", () => {
		expect(() => layoutTransitionSeries([seq(30), tr(10), tr(10), seq(30)], 30)).toThrow(
			/two transitions cannot be next to each other/,
		);
		expect(() => layoutTransitionSeries([seq(30), overlay(4), overlay(4), seq(30)], 30)).toThrow(
			/two overlays cannot be next to each other/,
		);
		expect(() => layoutTransitionSeries([seq(30), tr(10), overlay(4), seq(30)], 30)).toThrow(
			/a transition and an overlay cannot be next to each other/,
		);
		expect(() => layoutTransitionSeries([tr(10)], 30)).toThrow(/at least one/);
		expect(() => layoutTransitionSeries([seq(5), tr(10), seq(30)], 30)).toThrow(
			/longer than the previous sequence \(5 frames\)/,
		);
		expect(() => layoutTransitionSeries([seq(30), tr(10), seq(5)], 30)).toThrow(
			/longer than the next sequence \(5 frames\)/,
		);
	});

	it("validates sequence durations and offsets", () => {
		expect(() => layoutTransitionSeries([seq(0)], 30)).toThrow(/positive integer/);
		expect(() => layoutTransitionSeries([seq(1.5)], 30)).toThrow(/positive integer/);
		expect(() => layoutTransitionSeries([seq(Number.POSITIVE_INFINITY), seq(10)], 30)).toThrow(
			/only the last sequence/,
		);
		expect(() => layoutTransitionSeries([seq(10, { offset: 0.5 })], 30)).toThrow(
			/"offset" must be an integer/,
		);
		expect(() => layoutTransitionSeries([seq(Number.POSITIVE_INFINITY), tr(10)], 30)).toThrow(
			/infinite duration/,
		);
		expect(
			layoutTransitionSeries([seq(10), tr(5), seq(Number.POSITIVE_INFINITY)], 30).durationInFrames,
		).toBe(Number.POSITIVE_INFINITY);
	});
});
