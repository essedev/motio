// The fragment shader is ported from the "swap" GL Transition by gre
// (https://gl-transitions.com/editor/swap), from the gl-transitions collection
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

/** Props of `swap()`. */
export type SwapProps = {
	/** Strength of the reflection on the floor. Default 0.4. */
	reflection?: number;
	/** Perspective distortion while the scenes move. Default 0.2. */
	perspective?: number;
	/** How far each scene moves into depth. Default 3. */
	depth?: number;
};

const FRAGMENT = glTransition(
	`
uniform float reflection;
uniform float perspective;
uniform float depth;

const vec4 black = vec4(0.0, 0.0, 0.0, 1.0);
const vec2 boundMin = vec2(0.0, 0.0);
const vec2 boundMax = vec2(1.0, 1.0);

bool inBounds(vec2 p) {
	return all(lessThan(boundMin, p)) && all(lessThan(p, boundMax));
}

vec2 project(vec2 p) {
	return p * vec2(1.0, -1.2) + vec2(0.0, -0.02);
}

vec4 bgColor(vec2 p, vec2 pfr, vec2 pto) {
	vec4 c = black;
	pfr = project(pfr);
	if (inBounds(pfr)) {
		c += mix(black, getFromColor(pfr), reflection * pfr.y);
	}
	pto = project(pto);
	if (inBounds(pto)) {
		c += mix(black, getToColor(pto), reflection * pto.y);
	}
	return c;
}

vec4 transition(vec2 p) {
	vec2 pfr, pto = vec2(-1.0);
	float size = mix(1.0, depth, progress);
	float persp = perspective * progress;
	pfr = (p + vec2(-0.0, -0.5)) * vec2(size / (1.0 - perspective * progress), size / (1.0 - size * persp * p.x)) + vec2(0.0, 0.5);
	size = mix(1.0, depth, 1.0 - progress);
	persp = perspective * (1.0 - progress);
	pto = (p + vec2(-1.0, -0.5)) * vec2(size / (1.0 - perspective * (1.0 - progress)), size / (1.0 - size * persp * (0.5 - p.x))) + vec2(1.0, 0.5);
	if (progress < 0.5) {
		if (inBounds(pfr)) return getFromColor(pfr);
		if (inBounds(pto)) return getToColor(pto);
	}
	if (inBounds(pto)) return getToColor(pto);
	if (inBounds(pfr)) return getFromColor(pfr);
	return bgColor(p, pfr, pto);
}
`,
	{ from: "entering", flipY: true },
);

/** The shader behind `swap()`. */
export const swapShader: HtmlInCanvasShader<SwapProps> = createQuadShader(
	"swap()",
	FRAGMENT,
	(gl, location, { passedProps }) => {
		gl.uniform1f(location("reflection"), passedProps.reflection ?? 0.4);
		gl.uniform1f(location("perspective"), passedProps.perspective ?? 0.2);
		gl.uniform1f(location("depth"), passedProps.depth ?? 3);
	},
);

/**
 * Swaps the scenes in perspective, moving them in depth over a reflecting floor. An HTML-in-canvas presentation: the scenes are rasterised through Chrome's HTML-in-canvas
 * API, which Motio's renderer has.
 */
export const swap: (
	props?: SwapProps & HtmlInCanvasPresentationOptions,
) => TransitionPresentation<SwapProps> = builtInPresentation("swap", swapShader, (props) => {
	assertFiniteOption("swap", "reflection", props.reflection);
	assertFiniteOption("swap", "perspective", props.perspective);
	assertFiniteOption("swap", "depth", props.depth);
});
