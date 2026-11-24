// Records what <Freeze> shows when its frame lies beyond the duration of the
// enclosing timeline: a <Still> (one frame at 1 fps), a composition shorter
// than the frozen frame, and a short <Sequence>, with nested <Sequence>,
// <Series> and <Loop> inside. Scenes render inside @remotion/player's
// <Thumbnail> with react-dom/server, as record-interactive.mjs does. Called by
// record.mjs; public API only.

import { Thumbnail } from "@remotion/player";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Freeze, Loop, Sequence, Series, useCurrentFrame, useVideoConfig } from "remotion";
import { captureTyped } from "./record-interpolate-outputs.mjs";

// Scene specs, a JSON language the Motio test rebuilds with its own components:
//   string                                   a text node
//   { probe: true }                          text "[f=<frame> d=<durationInFrames>]"
//   { c: "Freeze" | "Sequence" | "Loop" | "Series" | "Series.Sequence", props, children }
const probe = { probe: true };
const freeze = (frame, ...children) => ({ c: "Freeze", props: { frame }, children });
const seq = (props, ...children) => ({ c: "Sequence", props, children });

// [label, timeline, node, frames]
const STILL = { durationInFrames: 1, fps: 1 };
const SHORT = { durationInFrames: 30, fps: 30 };
const SCENES = [
	["still: probe under Freeze", STILL, freeze(90, probe), [0]],
	["still: Sequence under Freeze", STILL, freeze(90, seq({}, probe)), [0]],
	["still: Sequence from 60 under Freeze", STILL, freeze(90, seq({ from: 60 }, probe)), [0]],
	[
		"still: Sequence from 60 for 20 under Freeze (ended)",
		STILL,
		freeze(90, seq({ from: 60, durationInFrames: 20 }, probe)),
		[0],
	],
	[
		"still: Sequence from 60 for 40 under Freeze",
		STILL,
		freeze(90, seq({ from: 60, durationInFrames: 40 }, probe)),
		[0],
	],
	[
		"still: Sequence from 100 under Freeze (not started)",
		STILL,
		freeze(90, seq({ from: 100 }, probe)),
		[0],
	],
	["still: Sequence from -90 under Freeze", STILL, freeze(90, seq({ from: -90 }, probe)), [0]],
	["still: Sequence under Freeze at 0", STILL, freeze(0, seq({}, probe)), [0]],
	[
		"still: nested Sequences under Freeze",
		STILL,
		freeze(90, seq({ from: 30 }, seq({ from: 20 }, probe))),
		[0],
	],
	[
		"still: Series under Freeze",
		STILL,
		freeze(90, {
			c: "Series",
			props: {},
			children: [
				{ c: "Series.Sequence", props: { durationInFrames: 60 }, children: ["A", probe] },
				{ c: "Series.Sequence", props: { durationInFrames: 60 }, children: ["B", probe] },
			],
		}),
		[0],
	],
	[
		"still: Loop under Freeze",
		STILL,
		freeze(90, { c: "Loop", props: { durationInFrames: 40 }, children: [probe] }),
		[0],
	],
	["still: Sequence freeze prop", STILL, seq({ freeze: 90 }, seq({}, probe)), [0]],
	["composition of 30: Sequence under Freeze", SHORT, freeze(90, seq({}, probe)), [0, 10, 29]],
	[
		"composition of 30: Sequence for 10 then Freeze then Sequence",
		SHORT,
		seq({ durationInFrames: 10 }, freeze(50, seq({ from: 40 }, probe))),
		[0, 5],
	],
	[
		"composition of 30: Freeze inside a Sequence for 10",
		SHORT,
		seq({ durationInFrames: 10 }, freeze(50, probe)),
		[5],
	],
	[
		"composition of 30: Freeze inside a Sequence from 5",
		SHORT,
		seq({ from: 5 }, freeze(50, probe)),
		[10],
	],
	["composition of 30: Freeze at -5", SHORT, freeze(-5, probe), [10]],
	["composition of 30: Freeze at 2.5", SHORT, freeze(2.5, probe), [10]],
	["composition of 30: Freeze at 30", SHORT, freeze(30, probe), [10]],
	["composition of 30: Freeze at 29.5", SHORT, freeze(29.5, probe), [10]],
	[
		"composition of 100: Sequence for 50 under Freeze at 90 (ended)",
		{ durationInFrames: 100, fps: 30 },
		freeze(90, seq({ durationInFrames: 50 }, probe)),
		[0],
	],
	[
		"composition of 100: Sequence from 60 under Freeze at 90",
		{ durationInFrames: 100, fps: 30 },
		freeze(90, seq({ from: 60 }, probe)),
		[0],
	],
	[
		"composition of 30: Sequence from 10 for 10 under Freeze at 90",
		SHORT,
		freeze(90, seq({ from: 10, durationInFrames: 10 }, probe)),
		[0],
	],
	[
		"composition of 30: Freeze at 50 inside playbackRate 2",
		SHORT,
		seq({ playbackRate: 2 }, freeze(50, probe)),
		[10],
	],
	[
		"composition of 30: Freeze at 50 inside from 5 and playbackRate 2",
		SHORT,
		seq({ from: 5, playbackRate: 2 }, freeze(50, probe)),
		[10],
	],
	[
		"composition of 30: Freeze at 50 inside trimBefore 10",
		SHORT,
		seq({ trimBefore: 10 }, freeze(50, probe)),
		[10],
	],
	[
		"composition of 30: Freeze at 30 inside trimBefore 10",
		SHORT,
		seq({ trimBefore: 10 }, freeze(30, probe)),
		[10],
	],
	[
		"composition of 30: Freeze at -10 inside from 5",
		SHORT,
		seq({ from: 5 }, freeze(-10, probe)),
		[10],
	],
	["composition of 30: Freeze at 3 inside from 5", SHORT, seq({ from: 5 }, freeze(3, probe)), [10]],
	["composition of 30: Freeze inside Freeze", SHORT, freeze(50, freeze(40, probe)), [10]],
	["composition of 30: Freeze at 50 inside Freeze at 3", SHORT, freeze(3, freeze(50, probe)), [10]],
	[
		"composition of 30: Freeze at 50 inside a Loop of 10",
		SHORT,
		{ c: "Loop", props: { durationInFrames: 10 }, children: [freeze(50, probe)] },
		[15],
	],
	["composition of 30: Sequence freeze 50", SHORT, seq({ freeze: 50 }, probe), [10]],
	[
		"composition of 30: Sequence from 5 freeze 50",
		SHORT,
		seq({ from: 5, freeze: 50 }, probe),
		[10],
	],
	["composition of 30: Sequence from 5 freeze 3", SHORT, seq({ from: 5, freeze: 3 }, probe), [10]],
	[
		"composition of 30: Sequence from 5 freeze 50 with a Sequence from 40",
		SHORT,
		seq({ from: 5, freeze: 50 }, seq({ from: 40 }, probe)),
		[10],
	],
	[
		"composition of 30: Sequence freeze 50 inside trimBefore 10 playbackRate 2",
		SHORT,
		seq({ trimBefore: 10, playbackRate: 2 }, seq({ freeze: 50 }, probe)),
		[10],
	],
];

const Probe = () => {
	const frame = useCurrentFrame();
	const { durationInFrames } = useVideoConfig();
	return `[f=${frame} d=${durationInFrames}]`;
};

const COMPONENTS = { Freeze, Sequence, Loop, Series, "Series.Sequence": Series.Sequence };

const build = (node) => {
	if (typeof node === "string") return node;
	if (node.probe) return h(Probe);
	return h(COMPONENTS[node.c], node.props, ...node.children.map(build));
};

const markupAt = (timeline, node, frame) => {
	const html = renderToStaticMarkup(
		h(Thumbnail, {
			component: () => build(node),
			compositionWidth: 100,
			compositionHeight: 100,
			durationInFrames: timeline.durationInFrames,
			fps: timeline.fps,
			frameToDisplay: frame,
		}),
	);
	// Keep only what the composition rendered, inside the Thumbnail's own wrappers.
	const start = html.indexOf('class="__remotion-player">') + 'class="__remotion-player">'.length;
	return html.slice(start, html.length - "</div></div></div>".length);
};

export const recordFreeze = ({ write }) => {
	write(
		"freeze",
		"Freeze beyond the enclosing duration: scene markup at frames",
		SCENES.map(([label, timeline, node, frames]) => ({
			label,
			timeline,
			node,
			frames,
			markup: frames.map((frame) => captureTyped(() => markupAt(timeline, node, frame))),
		})),
	);
};
