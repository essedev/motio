// The fragment shader is ported from the "FilmBurn" GL Transition by Anastasia Dunbar
// (https://gl-transitions.com/editor/FilmBurn), from the gl-transitions collection
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

/** Props of `filmBurn()`. */
export type FilmBurnProps = {
	/** Seed of the noise of the burn pattern. Default 2.31. */
	seed?: number;
};

const FRAGMENT = glTransition(
	`
uniform float Seed;

float sigmoid(float x, float a) {
	float b = pow(x * 2.0, a) / 2.0;
	if (x > 0.5) {
		b = 1.0 - pow(2.0 - (x * 2.0), a) / 2.0;
	}
	return b;
}
float rand(float co) {
	return fract(sin((co * 24.9898) + Seed) * 43758.5453);
}
float rand(vec2 co) {
	return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}
float apow(float a, float b) { return pow(abs(a), b) * sign(b); }
vec3 pow3(vec3 a, vec3 b) { return vec3(apow(a.r, b.r), apow(a.g, b.g), apow(a.b, b.b)); }
float smooth_mix(float a, float b, float c) { return mix(a, b, sigmoid(c, 2.0)); }
float random(vec2 co, float shft) {
	co += 10.0;
	return smooth_mix(fract(sin(dot(co.xy, vec2(12.9898 + (floor(shft) * 0.5), 78.233 + Seed))) * 43758.5453), fract(sin(dot(co.xy, vec2(12.9898 + (floor(shft + 1.0) * 0.5), 78.233 + Seed))) * 43758.5453), fract(shft));
}
float smooth_random(vec2 co, float shft) {
	return smooth_mix(smooth_mix(random(floor(co), shft), random(floor(co + vec2(1.0, 0.0)), shft), fract(co.x)), smooth_mix(random(floor(co + vec2(0.0, 1.0)), shft), random(floor(co + vec2(1.0, 1.0)), shft), fract(co.x)), fract(co.y));
}
vec4 blendedColor(vec2 p) {
	return mix(getFromColor(p), getToColor(p), sigmoid(progress, 10.0));
}
#define pi 3.14159265358979323
#define clamps(x) clamp(x, 0.0, 1.0)

vec4 transition(vec2 p) {
	vec3 f = vec3(0.0);
	for (float i = 0.0; i < 13.0; i++) {
		f += sin(((p.x * rand(i) * 6.0) + (progress * 8.0)) + rand(i + 1.43)) * sin(((p.y * rand(i + 4.4) * 6.0) + (progress * 6.0)) + rand(i + 2.4));
		f += 1.0 - clamps(length(p - vec2(smooth_random(vec2(progress * 1.3), i + 1.0), smooth_random(vec2(progress * 0.5), i + 6.25))) * mix(20.0, 70.0, rand(i)));
	}
	f += 4.0;
	f /= 11.0;
	f = pow3(f * vec3(1.0, 0.7, 0.6), vec3(1.0, 2.0 - sin(progress * pi), 1.3));
	f *= sin(progress * pi);
	p -= 0.5;
	p *= 1.0 + (smooth_random(vec2(progress * 5.0), 6.3) * sin(progress * pi) * 0.05);
	p += 0.5;
	vec4 blurred_image = vec4(0.0);
	float bluramount = sin(progress * pi) * 0.03;
	#define repeats 50.0
	for (float i = 0.0; i < repeats; i++) {
		vec2 q = vec2(cos(degrees((i / repeats) * 360.0)), sin(degrees((i / repeats) * 360.0))) * (rand(vec2(i, p.x + p.y)) + bluramount);
		vec2 uv2 = p + (q * bluramount);
		blurred_image += blendedColor(uv2);
	}
	blurred_image /= repeats;
	return blurred_image + vec4(f, 0.0);
}
`,
	{ from: "entering", flipY: false },
);

/** The shader behind `filmBurn()`. */
export const filmBurnShader: HtmlInCanvasShader<FilmBurnProps> = createQuadShader(
	"filmBurn()",
	FRAGMENT,
	(gl, location, { passedProps }) => {
		gl.uniform1f(location("Seed"), passedProps.seed ?? 2.31);
	},
);

/**
 * Burns between the scenes like old film: a glowing light leak over a radial blur. An HTML-in-canvas presentation: the scenes are rasterised through Chrome's HTML-in-canvas
 * API, which Motio's renderer has.
 */
export const filmBurn: (
	props?: FilmBurnProps & HtmlInCanvasPresentationOptions,
) => TransitionPresentation<FilmBurnProps> = builtInPresentation(
	"filmBurn",
	filmBurnShader,
	(props) => {
		assertFiniteOption("filmBurn", "seed", props.seed);
	},
);
