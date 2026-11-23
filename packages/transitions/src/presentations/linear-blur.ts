// The fragment shader is ported from the "LinearBlur" GL Transition by gre
// (https://gl-transitions.com/editor/LinearBlur), from the gl-transitions collection
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

/** Props of `linearBlur()`. */
export type LinearBlurProps = {
	/** How far the 20 by 20 blur samples spread. Default 0.1. */
	intensity?: number;
};

const FRAGMENT = glTransition(
	`
uniform float intensity;
const int passes = 20;

vec4 transition(vec2 uv) {
	vec4 c1 = vec4(0.0);
	vec4 c2 = vec4(0.0);
	float disp = intensity * (0.5 - distance(0.5, progress));
	for (int xi = 0; xi < passes; xi++) {
		float x = float(xi) / float(passes) - 0.5;
		for (int yi = 0; yi < passes; yi++) {
			float y = float(yi) / float(passes) - 0.5;
			vec2 v = vec2(x, y);
			float d = disp;
			c1 += getFromColor(uv + d * v);
			c2 += getToColor(uv + d * v);
		}
	}
	c1 /= float(passes * passes);
	c2 /= float(passes * passes);
	return mix(c1, c2, progress);
}
`,
	{ from: "exiting", flipY: false },
);

/** The shader behind `linearBlur()`. */
export const linearBlurShader: HtmlInCanvasShader<LinearBlurProps> = createQuadShader(
	"linearBlur()",
	FRAGMENT,
	(gl, location, { passedProps }) => {
		gl.uniform1f(location("intensity"), passedProps.intensity ?? 0.1);
	},
);

/**
 * Blurs both scenes in every direction while blending between them. An HTML-in-canvas presentation: the scenes are rasterised through Chrome's HTML-in-canvas
 * API, which Motio's renderer has.
 */
export const linearBlur: (
	props?: LinearBlurProps & HtmlInCanvasPresentationOptions,
) => TransitionPresentation<LinearBlurProps> = builtInPresentation(
	"linearBlur",
	linearBlurShader,
	(props) => {
		assertFiniteOption("linearBlur", "intensity", props.intensity);
	},
);
