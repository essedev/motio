// The fragment shader is ported from the "dissolve" GL Transition by hjm1fb
// (https://gl-transitions.com/editor/dissolve), from the gl-transitions collection
// (https://github.com/gl-transitions/gl-transitions), licensed as follows:
//
// MIT License
//
// Copyright (c) 2017-present gl-transitions contributors
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
import {
	assertFiniteOption,
	builtInPresentation,
	glTransition,
} from "../html-in-canvas/built-in.js";
import { createQuadShader } from "../html-in-canvas/gl.js";
import type {
	HtmlInCanvasPresentationOptions,
	HtmlInCanvasShader,
} from "../html-in-canvas/make-html-in-canvas-presentation.js";
import type { TransitionPresentation } from "../types.js";

/** Props of `dissolve()`. */
export type DissolveProps = {
	/** Width of the glowing burn edge, in luminance units. Default 0.1. */
	lineWidth?: number;
	/** Colour of the outer edge of the burn, as `#rrggbb`. Default `"#ff0000"`. */
	spreadColor?: string;
	/** Colour of the hot core of the burn, as `#rrggbb`. Default `"#e6e633"`. */
	hotColor?: string;
	/** Higher values darken the cooler areas. Default 5. */
	pow?: number;
	/** Glow of the edge; above 1 glows more. Default 1. */
	intensity?: number;
};

/** Parses a `#rrggbb` colour into the 0 to 1 channels a shader takes. */
function hexColor(name: string, option: string, value: unknown): [number, number, number] {
	if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) {
		throw new TypeError(`${name}(): "${option}" must be a "#rrggbb" colour, got ${String(value)}.`);
	}
	return [1, 3, 5].map((i) => Number.parseInt(value.slice(i, i + 2), 16) / 255) as [
		number,
		number,
		number,
	];
}

const FRAGMENT = glTransition(
	`
uniform float uLineWidth;
uniform vec3 uSpreadClr;
uniform vec3 uHotClr;
uniform float uPow;
uniform float uIntensity;

vec4 transition(vec2 uv) {
	vec4 from = getFromColor(uv);
	vec4 to = getToColor(uv);
	vec4 result;
	float burn = 0.5 + 0.5 * (0.299 * from.r + 0.587 * from.g + 0.114 * from.b);
	float show = burn - progress;
	if (show < 0.001) {
		result = to;
	} else {
		float factor = 1.0 - smoothstep(0.0, uLineWidth, show);
		vec3 burnColor = mix(uSpreadClr, uHotClr, factor);
		burnColor = pow(burnColor, vec3(uPow)) * uIntensity;
		vec3 finalRGB = mix(from.rgb, burnColor, factor * step(0.0001, progress));
		result = vec4(finalRGB, from.a);
	}
	return result;
}
`,
	{ from: "exiting", flipY: false },
);

/** The shader behind `dissolve()`. */
export const dissolveShader: HtmlInCanvasShader<DissolveProps> = createQuadShader(
	"dissolve()",
	FRAGMENT,
	(gl, location, { passedProps }) => {
		gl.uniform1f(location("uLineWidth"), passedProps.lineWidth ?? 0.1);
		gl.uniform3fv(
			location("uSpreadClr"),
			hexColor("dissolve", "spreadColor", passedProps.spreadColor ?? "#ff0000"),
		);
		gl.uniform3fv(
			location("uHotClr"),
			hexColor("dissolve", "hotColor", passedProps.hotColor ?? "#e6e633"),
		);
		gl.uniform1f(location("uPow"), passedProps.pow ?? 5);
		gl.uniform1f(location("uIntensity"), passedProps.intensity ?? 1);
	},
);

/**
 * Burns through the exiting scene with a glowing edge, revealing the entering scene where the burn has passed the luminance of each pixel. An HTML-in-canvas presentation: the scenes are rasterised through Chrome's HTML-in-canvas
 * API, which Motio's renderer has.
 */
export const dissolve: (
	props?: DissolveProps & HtmlInCanvasPresentationOptions,
) => TransitionPresentation<DissolveProps> = builtInPresentation(
	"dissolve",
	dissolveShader,
	(props) => {
		assertFiniteOption("dissolve", "lineWidth", props.lineWidth);
		assertFiniteOption("dissolve", "pow", props.pow);
		assertFiniteOption("dissolve", "intensity", props.intensity);
		if (props.spreadColor !== undefined) hexColor("dissolve", "spreadColor", props.spreadColor);
		if (props.hotColor !== undefined) hexColor("dissolve", "hotColor", props.hotColor);
	},
);
