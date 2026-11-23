// Records what Interactive renders: the elements it exposes, its schema
// helpers, and the static markup of scenes built from its elements and from
// Interactive.withSchema() / Interactive.create(), at chosen frames. Scenes
// render inside @remotion/player's <Thumbnail> (the public way to render a
// component at a frame without a renderer) with react-dom/server. Called by
// record.mjs; public API only.

import { Thumbnail } from "@remotion/player";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Interactive, useCurrentFrame, useVideoConfig } from "remotion";
import { captureTyped, tag } from "./record-interpolate-outputs.mjs";

// Scene specs, a JSON language the Motio test rebuilds with its own Interactive:
//   string                                     a text node
//   { probe: true }                            text "f=<frame> d=<durationInFrames>"
//   { el: "Div", props, children: [node] }     <Interactive.Div {...props}>
//   { wrap: { kind, options }, props }         Interactive[kind]({ Component: Keys, ...options })
// Keys renders <p style={props.style}> listing its props as "name:typeof".
const SCENES = [
	[
		"from",
		{ el: "Div", props: { from: 10, style: { color: "red" } }, children: [{ probe: true }] },
		[0, 5, 10, 20],
	],
	[
		"from and duration",
		{ el: "Div", props: { from: 5, durationInFrames: 10 }, children: [{ probe: true }] },
		[0, 5, 10, 20],
	],
	[
		"trimBefore and playbackRate",
		{ el: "Div", props: { trimBefore: 3, playbackRate: 2 }, children: [{ probe: true }] },
		[0, 5],
	],
	["hidden", { el: "Div", props: { hidden: true }, children: ["x"] }, [0]],
	["freeze", { el: "Div", props: { freeze: 7 }, children: [{ probe: true }] }, [0, 5]],
	[
		"crop with radius",
		{
			el: "Div",
			props: { cropLeft: 0.1, cropRight: 0.2, style: { color: "red", borderRadius: 4 } },
			children: ["x"],
		},
		[0],
	],
	["crop without style", { el: "Div", props: { cropTop: 0.5 }, children: ["x"] }, [0]],
	[
		"crop overlapping",
		{ el: "Div", props: { cropLeft: 0.7, cropRight: 0.6, cropBottom: 0.25 }, children: ["x"] },
		[0],
	],
	[
		"loop",
		{ el: "Div", props: { loop: true, durationInFrames: 4 }, children: [{ probe: true }] },
		[0, 5, 9],
	],
	[
		"timeline-only props",
		{
			el: "Div",
			props: {
				showInTimeline: false,
				name: "n",
				"data-x": "1",
				title: "t",
				id: "i",
				className: "c",
			},
			children: ["x"],
		},
		[0],
	],
	[
		"premountFor",
		{
			el: "Div",
			props: { from: 10, premountFor: 5, style: { color: "red" } },
			children: [{ probe: true }],
		},
		[3, 6, 10],
	],
	[
		"premount style",
		{
			el: "Div",
			props: { from: 10, premountFor: 5, styleWhilePremounted: { color: "blue" } },
			children: ["x"],
		},
		[6],
	],
	[
		"postmountFor",
		{
			el: "Div",
			props: { durationInFrames: 5, postmountFor: 5, styleWhilePostmounted: { opacity: 0.5 } },
			children: [{ probe: true }],
		},
		[3, 6, 12],
	],
	[
		"layout is an attribute",
		{ el: "Div", props: { layout: "absolute-fill" }, children: ["x"] },
		[0],
	],
	[
		"svg",
		{
			el: "Svg",
			props: { viewBox: "0 0 10 10", from: 2 },
			children: [
				{ el: "Circle", props: { r: 3, cx: 5, cy: 5, fill: "red" }, children: [] },
				{ el: "Text", props: { x: 1 }, children: ["t"] },
			],
		},
		[0, 3],
	],
	[
		"nested text",
		{
			el: "H1",
			props: { style: { fontSize: 10 } },
			children: [
				{ el: "Span", props: {}, children: ["s"] },
				{ el: "A", props: { href: "#" }, children: ["a"] },
			],
		},
		[0],
	],
	[
		"nested sequences",
		{
			el: "Div",
			props: { from: 10 },
			children: [{ el: "Div", props: { from: 5 }, children: [{ probe: true }] }],
		},
		[12, 16],
	],
	[
		"transform style",
		{
			el: "Div",
			props: { style: { translate: "0px -150px", scale: 0.5, rotate: "45deg" } },
			children: ["x"],
		},
		[0],
	],
];

const ALL_PROPS = {
	from: 1,
	durationInFrames: 50,
	trimBefore: 0,
	playbackRate: 1,
	loop: false,
	freeze: null,
	hidden: false,
	name: "n",
	showInTimeline: true,
	premountFor: 1,
	postmountFor: 1,
	styleWhilePremounted: { a: 1 },
	styleWhilePostmounted: { b: 1 },
	cropLeft: 0.1,
	cropRight: 0,
	cropTop: 0,
	cropBottom: 0,
	style: { color: "red" },
	title: "t",
	className: "c",
};

const WRAPPED = [
	[
		"withSchema wrapInSequence",
		{ kind: "withSchema", options: { schema: {}, wrapInSequence: true } },
		{ ...ALL_PROPS, layout: "none" },
		[5],
	],
	[
		"withSchema not wrapped",
		{ kind: "withSchema", options: { schema: {}, wrapInSequence: false } },
		{ ...ALL_PROPS, layout: "none" },
		[5],
	],
	["withSchema default", { kind: "withSchema", options: { schema: {} } }, ALL_PROPS, [5]],
	[
		"withSchema timing",
		{
			kind: "withSchema",
			options: {
				schema: { title: { type: "string", default: "T", description: "d" } },
				wrapInSequence: true,
			},
		},
		{ title: "A", from: 5, name: "nm", style: { color: "red" } },
		[0, 5, 8],
	],
	[
		"withSchema no props",
		{ kind: "withSchema", options: { schema: {}, wrapInSequence: true } },
		{},
		[0],
	],
	["create", { kind: "create", options: {} }, { ...ALL_PROPS, layout: "none" }, [5]],
	[
		"create absolute-fill",
		{ kind: "create", options: { layout: "absolute-fill" } },
		ALL_PROPS,
		[5],
	],
	[
		"create absolute-fill bare",
		{ kind: "create", options: { layout: "absolute-fill" } },
		{ title: "x" },
		[5],
	],
	["create crop only", { kind: "create", options: {} }, { cropLeft: 0.2 }, [0]],
	["create bare", { kind: "create", options: {} }, { title: "x" }, [0]],
	[
		"create timing",
		{
			kind: "create",
			options: { schema: { title: { type: "string", default: "T", description: "d" } } },
		},
		{ title: "A", from: 5 },
		[0, 5, 8],
	],
	[
		"create absolute-fill timing",
		{ kind: "create", options: { layout: "absolute-fill" } },
		{ from: 5, durationInFrames: 2 },
		[4, 5, 7],
	],
];

const Probe = () => {
	const frame = useCurrentFrame();
	const { durationInFrames } = useVideoConfig();
	return `f=${frame} d=${durationInFrames}`;
};

const Keys = (props) =>
	h(
		"p",
		{ style: props.style },
		Object.keys(props)
			.sort()
			.map((k) => `${k}:${props[k] === null ? "null" : typeof props[k]}`)
			.join(","),
	);

const build = (node) => {
	if (typeof node === "string") return node;
	if (node.probe) return h(Probe);
	if (node.wrap) {
		const Wrapped = Interactive[node.wrap.kind]({ Component: Keys, ...node.wrap.options });
		return h(Wrapped, node.props);
	}
	return h(Interactive[node.el], node.props, ...node.children.map(build));
};

const markupAt = (node, frame) => {
	const html = renderToStaticMarkup(
		h(Thumbnail, {
			component: () => build(node),
			compositionWidth: 100,
			compositionHeight: 100,
			durationInFrames: 100,
			fps: 30,
			frameToDisplay: frame,
		}),
	);
	// Keep only what the composition rendered, inside the Thumbnail's own wrappers.
	const start = html.indexOf('class="__remotion-player">') + 'class="__remotion-player">'.length;
	return html.slice(start, html.length - "</div></div></div>".length);
};

export const recordInteractive = ({ write }) => {
	const keys = Object.keys(Interactive).sort();
	const elements = keys.filter((k) => /^[A-Z]/.test(k));
	const schemas = keys.filter((k) => k.endsWith("Schema"));
	const scenes = [
		...SCENES.map(([label, node, frames]) => ({ label, node, frames })),
		...WRAPPED.map(([label, wrap, props, frames]) => ({ label, node: { wrap, props }, frames })),
		...elements.map((el) => ({
			label: `element ${el}`,
			node: { el, props: { className: "k", "data-n": el }, children: ["x"] },
			frames: [0],
		})),
	].map((scene) => ({
		...scene,
		markup: scene.frames.map((frame) => captureTyped(() => markupAt(scene.node, frame))),
	}));
	write("interactive", "Interactive: elements, schema helpers and scene markup at frames", [
		{
			kind: "api",
			keys,
			elements: Object.fromEntries(elements.map((el) => [el, Interactive[el].displayName])),
			schemas: Object.fromEntries(schemas.map((s) => [s, tag(Interactive[s])])),
		},
		...scenes.map((scene) => ({ kind: "scene", ...scene })),
	]);
};
