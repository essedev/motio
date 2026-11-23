// The fragment shader is ported from the "ripple" GL Transition by gre
// (https://gl-transitions.com/editor/ripple), from the gl-transitions collection
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

/** Props of `ripple()`. */
export type RippleProps = {
	/** Spatial frequency of the ripple wave. Default 100. */
	amplitude?: number;
	/** How fast the wave travels outward. Default 50. */
	speed?: number;
};

const FRAGMENT = glTransition(
	`
uniform float amplitude;
uniform float speed;

vec4 transition(vec2 uv) {
	vec2 dir = uv - vec2(0.5);
	float dist = length(dir);
	vec2 offset = dir * (sin(progress * dist * amplitude - progress * speed) + 0.5) / 30.0 * progress;
	return mix(getFromColor(uv + offset), getToColor(uv), smoothstep(0.2, 1.0, progress));
}
`,
	{ from: "exiting", flipY: false },
);

/** The shader behind `ripple()`. */
export const rippleShader: HtmlInCanvasShader<RippleProps> = createQuadShader(
	"ripple()",
	FRAGMENT,
	(gl, location, { passedProps }) => {
		gl.uniform1f(location("amplitude"), passedProps.amplitude ?? 100);
		gl.uniform1f(location("speed"), passedProps.speed ?? 50);
	},
);

/**
 * Displaces the exiting scene with a wave spreading from the center while crossfading to the entering scene. An HTML-in-canvas presentation: the scenes are rasterised through Chrome's HTML-in-canvas
 * API, which Motio's renderer has.
 */
export const ripple: (
	props?: RippleProps & HtmlInCanvasPresentationOptions,
) => TransitionPresentation<RippleProps> = builtInPresentation("ripple", rippleShader, (props) => {
	assertFiniteOption("ripple", "amplitude", props.amplitude);
	assertFiniteOption("ripple", "speed", props.speed);
});
