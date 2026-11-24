import { type ComponentType, createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { untag } from "../__oracle__/fixtures.js";
import fixture from "../__oracle__/freeze.json" with { type: "json" };
import { CompositionFrame } from "../composition/composition-frame.js";
import { makeConfig } from "../testing/harness.js";
import { Freeze } from "./freeze.js";
import { useCurrentFrame, useVideoConfig } from "./hooks.js";
import { Loop } from "./loop.js";
import { Sequence } from "./sequence.js";
import { Series } from "./series.js";

type Node =
	| string
	| { probe: true }
	| { c: string; props: Record<string, unknown>; children: Node[] };

type Scene = {
	label: string;
	timeline: { durationInFrames: number; fps: number };
	node: Node;
	frames: number[];
	markup: Array<{ out?: string; error?: string }>;
};

const Probe = () => {
	const frame = useCurrentFrame();
	const { durationInFrames } = useVideoConfig();
	return `[f=${frame} d=${durationInFrames}]`;
};

const COMPONENTS: Record<string, ComponentType<Record<string, unknown>>> = {
	Freeze: Freeze as ComponentType<Record<string, unknown>>,
	Sequence: Sequence as ComponentType<Record<string, unknown>>,
	Loop: Loop as ComponentType<Record<string, unknown>>,
	Series: Series as ComponentType<Record<string, unknown>>,
	"Series.Sequence": Series.Sequence as ComponentType<Record<string, unknown>>,
};

const build = (node: Node): ReactNode => {
	if (typeof node === "string") return node;
	if ("probe" in node) return h(Probe);
	return h(COMPONENTS[node.c] as ComponentType, node.props, ...node.children.map(build));
};

/** Motio's wrappers also carry the attributes its renderer seeks animations with. */
const withoutMotioAttributes = (html: string) => html.replace(/ data-motio-[a-z]+="[^"]*"/g, "");

const markupAt = (scene: Scene, frame: number) =>
	withoutMotioAttributes(
		renderToStaticMarkup(
			h(CompositionFrame, {
				component: () => build(scene.node),
				config: makeConfig({ width: 100, height: 100, ...scene.timeline }),
				frame,
			}),
		),
	);

const scenes = fixture.cases.map((c) => untag(c) as Scene);

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Freeze beyond the composition, against the Remotion oracle", () => {
	it.each(scenes.map((s) => [s.label, s] as const))("%s", (_label, scene) => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		scene.frames.forEach((frame, i) => {
			expect(markupAt(scene, frame), `frame ${frame}`).toBe(scene.markup[i]?.out);
		});
	});

	it("shows the nested sequences of a Freeze in a Still, held at the still's frame", () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const scene = scenes.find((s) => s.label === "still: Sequence under Freeze");
		expect(scene).toBeDefined();
		expect(markupAt(scene as Scene, 0)).toContain("[f=0 d=1]");
	});
});

describe("Freeze outside the composition: warning", () => {
	const render = (content: ReactNode, durationInFrames: number, frame = 0) =>
		renderToStaticMarkup(
			h(CompositionFrame, {
				component: () => content,
				config: makeConfig({ durationInFrames }),
				frame,
			}),
		);

	it("says which frame is shown and how to show the requested one, once", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const tree = h(Freeze, { frame: 91 }, h(Sequence, { from: 60 }, h(Probe)));
		expect(render(tree, 1)).not.toContain("[f=");
		render(tree, 1);
		expect(warn).toHaveBeenCalledTimes(1);
		const message = String(warn.mock.calls[0]?.[0]);
		expect(message).toContain("<Freeze>: frame 91 is past the end of the composition");
		expect(message).toContain("show frame 0 instead");
		expect(message).toContain("<Freeze frame={0}><Sequence from={-91}>");
	});

	it("the suggested fix shows the requested frame with its nested sequences", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const tree = h(
			Freeze,
			{ frame: 0 },
			h(Sequence, { from: -91 }, h(Sequence, { from: 60 }, h(Probe))),
		);
		expect(render(tree, 1)).toContain("[f=31 d=");
		expect(warn).not.toHaveBeenCalled();
	});

	it("warns for the freeze prop of a Sequence, before the start too", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		render(h(Sequence, { from: 5, freeze: -7 }, h(Probe)), 30, 10);
		expect(String(warn.mock.calls[0]?.[0])).toContain(
			'<Sequence> "freeze": frame -7 is before the start of the composition (its first frame is -5 here)',
		);
	});

	it("does not warn inside the composition", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		render(h(Freeze, { frame: 29 }, h(Probe)), 30, 3);
		render(h(Sequence, { freeze: 2.5 }, h(Probe)), 30, 3);
		expect(warn).not.toHaveBeenCalled();
	});
});
