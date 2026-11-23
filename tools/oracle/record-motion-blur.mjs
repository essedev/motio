// Records what @remotion/motion-blur's <CameraMotionBlur> and <Trail> render: the static markup of
// a probe child (which prints useCurrentFrame()) at chosen frames, inside @remotion/player's
// <Thumbnail>, for a grid of props, plus the messages of invalid props (rendered in jsdom).
// Called by record.mjs; public API only.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CameraMotionBlur, Trail } from "@remotion/motion-blur";
import { Thumbnail } from "@remotion/player";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Sequence, useCurrentFrame } from "remotion";
import { errorTypeOf } from "./record-interpolate-outputs.mjs";

const here = import.meta.dirname;
const outDir = join(here, "../../packages/motion-blur/src/__oracle__");

const Probe = () => h("i", null, String(useCurrentFrame()));
const COMPONENTS = { CameraMotionBlur, Trail };

/** The markup inside the Thumbnail's own wrappers. */
const inner = (markup) =>
	markup.replace(/^.*?class="__remotion-player">/, "").replace(/<\/div><\/div><\/div>$/, "");

const render = (component, props, frame, sequence) => {
	const element = h(COMPONENTS[component], props, h(Probe));
	return inner(
		renderToStaticMarkup(
			h(Thumbnail, {
				component: () => (sequence ? h(Sequence, sequence, element) : element),
				durationInFrames: 30,
				compositionWidth: 100,
				compositionHeight: 100,
				fps: 30,
				frameToDisplay: frame,
			}),
		),
	);
};

const FRAMES = [0, 1, 2, 3, 5, 10, 28, 29];
const CAMERA = [
	{},
	{ samples: 3 },
	{ samples: 2, shutterAngle: 360 },
	{ samples: 4, shutterAngle: 90 },
	{ samples: 10, shutterAngle: 108 },
	{ samples: 7, shutterAngle: 270 },
	{ samples: 1 },
	{ samples: 0 },
	{ shutterAngle: 0, samples: 2 },
	{ shutterAngle: 1, samples: 5 },
];
const TRAIL = [
	{ layers: 3, lagInFrames: 1, trailOpacity: 1 },
	{ layers: 2, lagInFrames: 0.5, trailOpacity: 0.5 },
	{ layers: 5, lagInFrames: 0.1, trailOpacity: 1 },
	{ layers: 3, lagInFrames: 1.5, trailOpacity: 0.8 },
	{ layers: 0, lagInFrames: 1, trailOpacity: 1 },
	{ layers: 2, lagInFrames: 0, trailOpacity: 1 },
	{ layers: 2, lagInFrames: -1, trailOpacity: 1 },
	{ layers: 2, lagInFrames: 1, trailOpacity: 2 },
	{ layers: 4, lagInFrames: 3, trailOpacity: 0.6 },
];
const SEQUENCES = [{ from: 5 }, { from: -5 }, { from: 5, durationInFrames: 5 }];

const tagged = (props) =>
	Object.fromEntries(
		Object.entries(props).map(([k, v]) => [
			k,
			typeof v === "number" && !Number.isFinite(v)
				? { $n: String(v) }
				: v === undefined
					? { $u: true }
					: v,
		]),
	);

const INVALID = [
	["CameraMotionBlur", { samples: -1 }],
	["CameraMotionBlur", { samples: 2.5 }],
	["CameraMotionBlur", { samples: "3" }],
	["CameraMotionBlur", { samples: Number.NaN }],
	["CameraMotionBlur", { samples: null }],
	["CameraMotionBlur", { samples: -1.5 }],
	["CameraMotionBlur", { shutterAngle: -10 }],
	["CameraMotionBlur", { shutterAngle: 400 }],
	["CameraMotionBlur", { shutterAngle: "90" }],
	["CameraMotionBlur", { shutterAngle: Number.POSITIVE_INFINITY }],
	["CameraMotionBlur", { samples: -1, shutterAngle: -1 }],
	["Trail", {}],
	["Trail", { layers: 2 }],
	["Trail", { layers: 2, trailOpacity: 1 }],
	["Trail", { layers: 2.5, lagInFrames: 1, trailOpacity: 1 }],
	["Trail", { layers: -1, lagInFrames: 1, trailOpacity: 1 }],
	["Trail", { layers: -1.5, lagInFrames: 1, trailOpacity: 1 }],
	["Trail", { layers: "2", lagInFrames: 1, trailOpacity: 1 }],
	["Trail", { layers: Number.NaN, lagInFrames: 1, trailOpacity: 1 }],
	["Trail", { layers: 2, lagInFrames: "1", trailOpacity: 1 }],
	["Trail", { layers: 2, lagInFrames: Number.NaN, trailOpacity: 1 }],
	["Trail", { layers: 2, lagInFrames: 1, trailOpacity: "x" }],
	["Trail", { layers: 2, lagInFrames: 1, trailOpacity: Number.POSITIVE_INFINITY }],
];

/** Renders each invalid case in jsdom and collects the thrown messages. */
const recordErrors = async () => {
	const { JSDOM } = await import("jsdom");
	const dom = new JSDOM("<!doctype html>", { pretendToBeVisual: true });
	const globals = [
		"window",
		"document",
		"HTMLElement",
		"requestAnimationFrame",
		"cancelAnimationFrame",
	];
	for (const key of globals) globalThis[key] = key === "window" ? dom.window : dom.window[key];
	globalThis.IS_REACT_ACT_ENVIRONMENT = true;
	const { act } = await import("react");
	const { createRoot } = await import("react-dom/client");
	const quiet = console.error;
	console.error = () => {};
	const errors = new Map();
	for (const [component, props] of INVALID) {
		let failure = null;
		const record = (e) => {
			failure = { error: e.message, errorType: errorTypeOf(e) };
		};
		const node = dom.window.document.createElement("div");
		const root = createRoot(node, {
			onCaughtError: record,
			onUncaughtError: record,
		});
		await act(async () => {
			root.render(
				h(Thumbnail, {
					component: () => h(COMPONENTS[component], props, h(Probe)),
					errorFallback: ({ error }) => {
						record(error);
						return null;
					},
					durationInFrames: 30,
					compositionWidth: 100,
					compositionHeight: 100,
					fps: 30,
					frameToDisplay: 5,
				}),
			);
		});
		root.unmount();
		errors.set(`${component} ${JSON.stringify(tagged(props))}`, failure);
	}
	console.error = quiet;
	return errors;
};

export const recordMotionBlur = async () => {
	const cases = [];
	for (const props of CAMERA) {
		for (const frame of FRAMES) {
			cases.push({
				component: "CameraMotionBlur",
				props,
				frame,
				markup: render("CameraMotionBlur", props, frame),
			});
		}
	}
	for (const props of TRAIL) {
		for (const frame of FRAMES) {
			cases.push({ component: "Trail", props, frame, markup: render("Trail", props, frame) });
		}
	}
	for (const sequence of SEQUENCES) {
		for (const frame of [2, 7, 9, 24, 29]) {
			for (const [component, props] of [
				["CameraMotionBlur", { samples: 2, shutterAngle: 360 }],
				["Trail", { layers: 3, lagInFrames: 2, trailOpacity: 1 }],
			]) {
				cases.push({
					component,
					props,
					frame,
					sequence,
					markup: render(component, props, frame, sequence),
				});
			}
		}
	}
	// Invalid props throw while rendering. Thumbnail's error boundary hides the message from
	// react-dom/server, so these render in jsdom with react-dom/client, which reports it. Last,
	// because jsdom's globals stay installed (React's scheduler still reads them afterwards).
	const errors = await recordErrors();
	for (const [component, props] of INVALID) {
		cases.push({
			component,
			props: tagged(props),
			...(errors.get(`${component} ${JSON.stringify(tagged(props))}`) ?? { error: null }),
		});
	}
	mkdirSync(outDir, { recursive: true });
	const remotionVersion = JSON.parse(
		readFileSync(join(here, "node_modules/@remotion/motion-blur/package.json"), "utf8"),
	).version;
	const body = {
		package: "@remotion/motion-blur",
		version: remotionVersion,
		description:
			"Markup of CameraMotionBlur and Trail around a probe printing useCurrentFrame(), in a 30-frame Thumbnail; errors of invalid props",
		cases,
	};
	writeFileSync(join(outDir, "markup.json"), `${JSON.stringify(body)}\n`);
	console.log(`motion-blur/markup.json: ${cases.length} cases`);
};
