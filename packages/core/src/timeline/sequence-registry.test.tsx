import { afterEach, describe, expect, it } from "vitest";
import { type Mounted, renderAtFrame } from "../testing/harness.js";
import { Loop } from "./loop.js";
import { Sequence } from "./sequence.js";
import {
	SequenceRegistry,
	SequenceRegistryContext,
	type TimelineSequence,
} from "./sequence-registry.js";
import { Series } from "./series.js";

let mounted: Mounted | null = null;
afterEach(() => {
	mounted?.unmount();
	mounted = null;
});

function collect(
	tree: React.ReactNode,
	frame: number,
): { registry: SequenceRegistry; at(frame: number): void } {
	const registry = new SequenceRegistry();
	mounted = renderAtFrame(
		<SequenceRegistryContext.Provider value={registry}>{tree}</SequenceRegistryContext.Provider>,
		frame,
	);
	const m = mounted;
	return { registry, at: (f) => m.at(f) };
}

const summary = (list: TimelineSequence[]) =>
	list.map(({ name, componentName, from, durationInFrames, loopDurationInFrames, hidden }) => ({
		name,
		componentName,
		from,
		durationInFrames,
		loopDurationInFrames,
		hidden,
	}));

describe("SequenceRegistry", () => {
	it("registers sequences outside their range, in composition frames", () => {
		const { registry } = collect(
			<>
				<Sequence from={10} durationInFrames={20} name="Title" />
				<Sequence from={40} name="Outro" />
				<Sequence from={-5} durationInFrames={10} hidden />
			</>,
			0,
		);
		expect(summary(registry.list())).toEqual([
			{
				name: "Title",
				componentName: "Sequence",
				from: 10,
				durationInFrames: 20,
				loopDurationInFrames: null,
				hidden: false,
			},
			{
				name: "Outro",
				componentName: "Sequence",
				from: 40,
				durationInFrames: 20,
				loopDurationInFrames: null,
				hidden: false,
			},
			{
				name: null,
				componentName: "Sequence",
				from: -5,
				durationInFrames: 10,
				loopDurationInFrames: null,
				hidden: true,
			},
		]);
	});

	it("nests sequences under their parent and maps their frames through it", () => {
		const { registry } = collect(
			<Sequence from={10} durationInFrames={40} name="Outer">
				<Sequence from={5} durationInFrames={100} playbackRate={2} name="Inner" />
			</Sequence>,
			12,
		);
		const list = registry.list();
		const outer = list.find((s) => s.name === "Outer");
		const inner = list.find((s) => s.name === "Inner");
		expect(outer?.parentId).toBeNull();
		expect(inner?.parentId).toBe(outer?.id);
		// Starts at 10 + 5; 100 child frames at 2x are 50 frames, cut at the parent's end (50).
		expect(inner).toMatchObject({ from: 15, durationInFrames: 35 });
	});

	it("lists a Series with its children and a Loop as a whole with its iteration length", () => {
		const { registry } = collect(
			<>
				<Series>
					<Series.Sequence durationInFrames={15} name="One" />
					<Series.Sequence durationInFrames={20} offset={5} name="Two" />
				</Series>
				<Loop durationInFrames={12} name="Beat" />
			</>,
			0,
		);
		expect(summary(registry.list())).toEqual([
			{
				name: "One",
				componentName: "Series.Sequence",
				from: 0,
				durationInFrames: 15,
				loopDurationInFrames: null,
				hidden: false,
			},
			{
				name: "Two",
				componentName: "Series.Sequence",
				from: 20,
				durationInFrames: 20,
				loopDurationInFrames: null,
				hidden: false,
			},
			// The Series itself is a sequence spanning its children; they nest under it.
			{
				name: null,
				componentName: "Series",
				from: 0,
				durationInFrames: 60,
				loopDurationInFrames: null,
				hidden: false,
			},
			{
				name: "Beat",
				componentName: "Loop",
				from: 0,
				durationInFrames: 60,
				loopDurationInFrames: 12,
				hidden: false,
			},
		]);
	});

	it("skips showInTimeline={false} and attaches its children to the next listed parent", () => {
		const { registry } = collect(
			<Sequence from={10} name="Outer">
				<Sequence from={0} showInTimeline={false}>
					<Sequence from={2} name="Leaf" />
				</Sequence>
			</Sequence>,
			20,
		);
		const list = registry.list();
		expect(list.map((s) => s.name).sort()).toEqual(["Leaf", "Outer"]);
		expect(list.find((s) => s.name === "Leaf")?.parentId).toBe(
			list.find((s) => s.name === "Outer")?.id,
		);
	});

	it("notifies only on changes and forgets unmounted sequences", () => {
		const Tree = ({ show }: { show: boolean }) =>
			show ? <Sequence from={30} name="Late" /> : null;
		const registry = new SequenceRegistry();
		let calls = 0;
		registry.subscribe(() => calls++);
		mounted = renderAtFrame(
			<SequenceRegistryContext.Provider value={registry}>
				<Tree show />
			</SequenceRegistryContext.Provider>,
			0,
		);
		const first = registry.list();
		expect(first).toHaveLength(1);
		mounted.at(1);
		expect(registry.list()).toBe(first);
		expect(calls).toBe(1);
		mounted.unmount();
		mounted = null;
		expect(registry.list()).toEqual([]);
	});

	it("registers nothing without a registry", () => {
		mounted = renderAtFrame(<Sequence from={10} name="Title" />, 0);
		expect(mounted.container.innerHTML).toBe("");
	});
});
