// The fragment shader is ported from the "BookFlip" GL Transition by hong
// (https://gl-transitions.com/editor/BookFlip), from the gl-transitions collection
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

/** Where the page of `bookFlip()` is turned from. */
export type BookFlipDirection = "from-left" | "from-right" | "from-top" | "from-bottom";

/** Props of `bookFlip()`. */
export type BookFlipProps = {
	/** Edge the page turn starts from. Default `"from-right"`. */
	direction?: BookFlipDirection;
};

const DIRECTIONS: readonly BookFlipDirection[] = [
	"from-right",
	"from-left",
	"from-top",
	"from-bottom",
];

const FRAGMENT = glTransition(
	`
uniform int uDirection;

// The shader is written for a page turning from the right; the other directions turn the
// coordinates so that their edge is on the right, and back for sampling.
vec2 toPage(vec2 uv) {
	if (uDirection == 1) return vec2(1.0 - uv.x, uv.y);
	if (uDirection == 2) return vec2(1.0 - uv.y, uv.x);
	if (uDirection == 3) return vec2(uv.y, uv.x);
	return uv;
}
vec2 fromPage(vec2 p) {
	if (uDirection == 1) return vec2(1.0 - p.x, p.y);
	if (uDirection == 2) return vec2(p.y, 1.0 - p.x);
	if (uDirection == 3) return vec2(p.y, p.x);
	return p;
}

float nonZero(float x) {
	return abs(x) < 1e-4 ? (x < 0.0 ? -1e-4 : 1e-4) : x;
}

vec2 skewRight(vec2 p) {
	float skewX = (p.x - progress) / nonZero(0.5 - progress) * 0.5;
	float skewY = (p.y - 0.5) / (0.5 + progress * (p.x - 0.5) / 0.5) * 0.5 + 0.5;
	return vec2(skewX, skewY);
}

vec2 skewLeft(vec2 p) {
	float skewX = (p.x - 0.5) / nonZero(progress - 0.5) * 0.5 + 0.5;
	float skewY = (p.y - 0.5) / (0.5 + (1.0 - progress) * (0.5 - p.x) / 0.5) * 0.5 + 0.5;
	return vec2(skewX, skewY);
}

vec4 addShade() {
	float shadeVal = max(0.7, abs(progress - 0.5) * 2.0);
	return vec4(vec3(shadeVal), 1.0);
}

vec4 transition(vec2 uv) {
	vec2 p = toPage(uv);
	float pr = step(1.0 - progress, p.x);
	if (p.x < 0.5) {
		return mix(getFromColor(fromPage(p)), getToColor(fromPage(skewLeft(p))) * addShade(), pr);
	}
	return mix(getFromColor(fromPage(skewRight(p))) * addShade(), getToColor(fromPage(p)), pr);
}
`,
	{ from: "exiting", flipY: false },
);

/** The shader behind `bookFlip()`. */
export const bookFlipShader: HtmlInCanvasShader<BookFlipProps> = createQuadShader(
	"bookFlip()",
	FRAGMENT,
	(gl, location, { passedProps }) => {
		gl.uniform1i(location("uDirection"), DIRECTIONS.indexOf(passedProps.direction ?? "from-right"));
	},
);

/**
 * Bends the exiting and entering scenes into a shaded page turn. An HTML-in-canvas presentation: the scenes are rasterised through Chrome's HTML-in-canvas
 * API, which Motio's renderer has.
 */
export const bookFlip: (
	props?: BookFlipProps & HtmlInCanvasPresentationOptions,
) => TransitionPresentation<BookFlipProps> = builtInPresentation(
	"bookFlip",
	bookFlipShader,
	(props) => {
		if (props.direction !== undefined && !DIRECTIONS.includes(props.direction)) {
			throw new TypeError(
				`bookFlip(): "direction" must be one of ${DIRECTIONS.map((d) => `"${d}"`).join(", ")}, got ${String(props.direction)}.`,
			);
		}
	},
);
