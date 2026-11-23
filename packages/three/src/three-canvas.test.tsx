import { CompositionFrame } from "@motiojs/core/internals";
import { createElement as h, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThreeCanvas, useOffthreadVideoTexture, useVideoTexture } from "./index.js";

const config = {
	id: "test",
	width: 640,
	height: 360,
	fps: 30,
	durationInFrames: 60,
	defaultProps: {},
	props: {},
	defaultCodec: null,
	defaultOutName: null,
	defaultVideoImageFormat: null,
	defaultPixelFormat: null,
	defaultProResProfile: null,
	defaultSampleRate: null,
};

/** Static markup of `element` at frame 0 of a composition. */
const markupOf = (element: ReactElement) =>
	renderToStaticMarkup(h(CompositionFrame, { component: () => element, config, frame: 0 }));

describe("<ThreeCanvas>", () => {
	it("renders a fixed-size container with the canvas, merging the style", () => {
		const markup = markupOf(
			h(ThreeCanvas, { width: 640, height: 360, style: { backgroundColor: "white" }, id: "c" }),
		);
		expect(markup).toContain(
			'<div id="c" style="position:relative;width:640px;height:360px;overflow:hidden;pointer-events:auto;background-color:white"><canvas style="display:block"></canvas></div>',
		);
	});

	// Validated before any hook, so no composition is needed (and no error boundary swallows it).
	it("needs a positive width and height", () => {
		expect(() => renderToStaticMarkup(h(ThreeCanvas, { width: 0, height: 360 }))).toThrow(
			/positive "width" and "height"/,
		);
		expect(() => renderToStaticMarkup(h(ThreeCanvas, { width: 640, height: Number.NaN }))).toThrow(
			/positive "width" and "height"/,
		);
	});
});

describe("deprecated texture hooks", () => {
	it("throw, pointing to the @remotion/media recipe", () => {
		expect(() => useVideoTexture()).toThrow(/as-threejs-texture/);
		expect(() => useOffthreadVideoTexture({ src: "x" })).toThrow(/@remotion\/media/);
	});
});
