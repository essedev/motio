// The fragment shader is ported from the "DreamyZoom" GL Transition by Zeh Fernando
// (https://gl-transitions.com/editor/DreamyZoom), from the gl-transitions collection
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

/** Props of `dreamyZoom()`. */
export type DreamyZoomProps = {
	/** Rotation angle in degrees. Default 6. */
	rotation?: number;
	/** Zoom scale at the white flash in the middle. Default 1.2. */
	scale?: number;
};

const FRAGMENT = glTransition(
	`
#define DEG2RAD 0.03926990816987241548078304229099

uniform float rotation;
uniform float scale;

vec4 transition(vec2 uv) {
	float phase = progress < 0.5 ? progress * 2.0 : (progress - 0.5) * 2.0;
	float angleOffset = progress < 0.5 ? mix(0.0, rotation * DEG2RAD, phase) : mix(-rotation * DEG2RAD, 0.0, phase);
	float newScale = progress < 0.5 ? mix(1.0, scale, phase) : mix(scale, 1.0, phase);
	vec2 center = vec2(0, 0);
	vec2 p = (uv.xy - vec2(0.5, 0.5)) / newScale * vec2(ratio, 1.0);
	float angle = atan(p.y, p.x) + angleOffset;
	float dist = distance(center, p);
	p.x = cos(angle) * dist / ratio + 0.5;
	p.y = sin(angle) * dist + 0.5;
	vec4 c = progress < 0.5 ? getFromColor(p) : getToColor(p);
	return c + (progress < 0.5 ? mix(0.0, 1.0, phase) : mix(1.0, 0.0, phase));
}
`,
	{ from: "entering", flipY: false },
);

/** The shader behind `dreamyZoom()`. */
export const dreamyZoomShader: HtmlInCanvasShader<DreamyZoomProps> = createQuadShader(
	"dreamyZoom()",
	FRAGMENT,
	(gl, location, { passedProps }) => {
		gl.uniform1f(location("rotation"), passedProps.rotation ?? 6);
		gl.uniform1f(location("scale"), passedProps.scale ?? 1.2);
	},
);

/**
 * Zooms and rotates through a white flash between the scenes. An HTML-in-canvas presentation: the scenes are rasterised through Chrome's HTML-in-canvas
 * API, which Motio's renderer has.
 */
export const dreamyZoom: (
	props?: DreamyZoomProps & HtmlInCanvasPresentationOptions,
) => TransitionPresentation<DreamyZoomProps> = builtInPresentation(
	"dreamyZoom",
	dreamyZoomShader,
	(props) => {
		assertFiniteOption("dreamyZoom", "rotation", props.rotation);
		assertFiniteOption("dreamyZoom", "scale", props.scale);
	},
);
