// The fragment shader is ported from the "crosswarp" GL Transition by Eke Péter
// (https://gl-transitions.com/editor/crosswarp), from the gl-transitions collection
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
import { builtInPresentation, glTransition } from "../html-in-canvas/built-in.js";
import { createQuadShader } from "../html-in-canvas/gl.js";
import type {
	HtmlInCanvasPresentationOptions,
	HtmlInCanvasShader,
} from "../html-in-canvas/make-html-in-canvas-presentation.js";
import type { TransitionPresentation } from "../types.js";

/** Props of `crosswarp()`: none besides the common HTML-in-canvas options. */
export type CrosswarpProps = Record<string, never>;

const FRAGMENT = glTransition(
	`
vec4 transition(vec2 p) {
	float x = progress;
	x = smoothstep(0.0, 1.0, (x * 2.0 + p.x - 1.0));
	return mix(getFromColor((p - 0.5) * (1.0 - x) + 0.5), getToColor((p - 0.5) * x + 0.5), x);
}
`,
	{ from: "exiting", flipY: false },
);

/** The shader behind `crosswarp()`. */
export const crosswarpShader: HtmlInCanvasShader<CrosswarpProps> = createQuadShader(
	"crosswarp()",
	FRAGMENT,
);

/**
 * Warps the exiting and the entering scene against each other along the x axis. An HTML-in-canvas
 * presentation (needs Chrome's HTML-in-canvas API, which Motio's renderer has).
 */
export const crosswarp: (
	props?: CrosswarpProps & HtmlInCanvasPresentationOptions,
) => TransitionPresentation<CrosswarpProps> = builtInPresentation("crosswarp", crosswarpShader);
