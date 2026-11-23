import { type ComponentType, createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { untag } from "./__oracle__/fixtures.js";
import fixture from "./__oracle__/interactive.json" with { type: "json" };
import { CompositionFrame } from "./composition/composition-frame.js";
import { RemotionEnvironmentContext } from "./environment.js";
import { Interactive } from "./interactive.js";
import { makeConfig, renderAtFrame } from "./testing/harness.js";
import { useCurrentFrame, useVideoConfig } from "./timeline/hooks.js";

type Node =
	| string
	| { probe: true }
	| { el: string; props: Record<string, unknown>; children: Node[] }
	| {
			wrap: { kind: "withSchema" | "create"; options: Record<string, unknown> };
			props: Record<string, unknown>;
	  };

type Scene = {
	kind: "scene";
	label: string;
	node: Node;
	frames: number[];
	markup: Array<{ out?: string; error?: string }>;
};

type Api = {
	kind: "api";
	keys: string[];
	elements: Record<string, string>;
	schemas: Record<string, unknown>;
};

const Probe = () => {
	const frame = useCurrentFrame();
	const { durationInFrames } = useVideoConfig();
	return `f=${frame} d=${durationInFrames}`;
};

/** Lists its props as "name:typeof", like the component the recorder wraps. */
const Keys = (props: Record<string, unknown>) =>
	h(
		"p",
		{ style: props.style },
		Object.keys(props)
			.sort()
			.map((k) => `${k}:${props[k] === null ? "null" : typeof props[k]}`)
			.join(","),
	);

const elements = Interactive as unknown as Record<string, ComponentType<Record<string, unknown>>>;

const build = (node: Node): ReactNode => {
	if (typeof node === "string") return node;
	if ("probe" in node) return h(Probe);
	if ("wrap" in node) {
		const factory = Interactive[node.wrap.kind] as (
			o: Record<string, unknown>,
		) => ComponentType<Record<string, unknown>>;
		return h(factory({ Component: Keys, ...node.wrap.options }), node.props);
	}
	return h(
		elements[node.el] as ComponentType<Record<string, unknown>>,
		node.props,
		...node.children.map(build),
	);
};

const config = makeConfig({ width: 100, height: 100, fps: 30, durationInFrames: 100 });

const markupAt = (content: ReactNode, frame: number) =>
	renderToStaticMarkup(h(CompositionFrame, { component: () => content, config, frame }));

const api = untag(fixture.cases[0]) as Api;
const scenes = fixture.cases.slice(1).map((c) => untag(c) as Scene);

describe("Interactive against the Remotion oracle", () => {
	it("exposes the same elements and helpers", () => {
		const documented = api.keys.filter((k) => !k.startsWith("_"));
		expect(Object.keys(Interactive).sort()).toEqual(documented);
		for (const [name, displayName] of Object.entries(api.elements)) {
			expect((elements[name] as { displayName?: string }).displayName).toBe(displayName);
		}
	});

	it("exports the schema helpers with the same values", () => {
		for (const [name, schema] of Object.entries(api.schemas)) {
			expect((Interactive as unknown as Record<string, unknown>)[name], name).toStrictEqual(schema);
		}
	});

	for (const scene of scenes) {
		it(`renders ${scene.label} like Remotion`, () => {
			scene.frames.forEach((frame, i) => {
				const expected = scene.markup[i] as { out?: string; error?: string };
				expect(expected.error, scene.label).toBeUndefined();
				expect(markupAt(build(scene.node), frame), `${scene.label} at frame ${frame}`).toBe(
					expected.out,
				);
			});
		});
	}
});

describe("Interactive", () => {
	it("does not premount while rendering", () => {
		const node = h(Interactive.Div, { from: 10, premountFor: 5 }, "x");
		const rendering = renderToStaticMarkup(
			h(
				RemotionEnvironmentContext.Provider,
				{
					value: {
						isStudio: false,
						isRendering: true,
						isPlayer: false,
						isReadOnlyStudio: false,
						isClientSideRendering: false,
					},
				},
				h(CompositionFrame, { component: () => node, config, frame: 6 }),
			),
		);
		expect(rendering).toBe("");
		expect(markupAt(node, 6)).toContain("opacity:0");
	});

	it("forwards refs to the element and keeps the children on the shifted timeline", () => {
		let element: HTMLElement | null = null;
		const mounted = renderAtFrame(
			h(
				Interactive.Div,
				{
					from: 10,
					ref: (e: HTMLElement | null) => {
						element = e;
					},
				},
				h(Probe),
			),
			12,
			{ durationInFrames: 100 },
		);
		expect((element as HTMLElement | null)?.textContent).toBe("f=2 d=90");
		mounted.unmount();
	});
});
