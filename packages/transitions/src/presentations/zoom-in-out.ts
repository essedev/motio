// The fragment shader is ported from the "zoomInOut" GL Transition by OllyOllyOlly
// (https://gl-transitions.com/editor/zoomInOut), from the gl-transitions collection
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

/** Props of `zoomInOut()`: none besides the common HTML-in-canvas options. */
export type ZoomInOutProps = Record<string, never>;

const FRAGMENT = glTransition(
	`
vec2 zoom(vec2 uv, float amount) {
	return 0.5 + ((uv - 0.5) * (1.0 - amount));
}

vec4 transition(vec2 uv) {
	float zoomFrom = smoothstep(0.0, 1.0, progress * 2.0);
	float zoomTo = smoothstep(0.0, 1.0, (1.0 - progress) * 2.0);
	float crossfade = smoothstep(0.4, 0.6, progress);
	return mix(getFromColor(zoom(uv, zoomFrom)), getToColor(zoom(uv, zoomTo)), crossfade);
}
`,
	{ from: "exiting", flipY: false },
);

/** The shader behind `zoomInOut()`. */
export const zoomInOutShader: HtmlInCanvasShader<ZoomInOutProps> = createQuadShader(
	"zoomInOut()",
	FRAGMENT,
);

/**
 * The exiting scene zooms in and crossfades into the entering scene, which zooms back out. An HTML-in-canvas presentation: the scenes are rasterised through Chrome's HTML-in-canvas
 * API, which Motio's renderer has.
 */
export const zoomInOut: (
	props?: ZoomInOutProps & HtmlInCanvasPresentationOptions,
) => TransitionPresentation<ZoomInOutProps> = builtInPresentation("zoomInOut", zoomInOutShader);
