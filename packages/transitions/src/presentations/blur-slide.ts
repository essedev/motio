import { assertFiniteOption, builtInPresentation } from "../html-in-canvas/built-in.js";
import {
	createProgram,
	createSceneTexture,
	effectiveTime,
	FRAGMENT_HEADER,
	getWebGl2,
	QUAD_VERTEX,
	uploadScene,
} from "../html-in-canvas/gl.js";
import type {
	HtmlInCanvasPresentationOptions,
	HtmlInCanvasShader,
	HtmlInCanvasShaderDrawParams,
} from "../html-in-canvas/make-html-in-canvas-presentation.js";
import type { TransitionPresentation } from "../types.js";

/** Where the entering scene of `blurSlide()` comes from. */
export type BlurSlideDirection = "from-left" | "from-right" | "from-top" | "from-bottom";

/** Props of `blurSlide()`. */
export type BlurSlideProps = {
	/** Side the entering scene slides in from. Default `"from-left"`. */
	direction?: BlurSlideDirection;
	/**
	 * Longest motion blur, as a fraction of the frame along the slide, reached at the midpoint.
	 * 0 or more. Default 0.5.
	 */
	blur?: number;
};

const DIRECTIONS: readonly BlurSlideDirection[] = [
	"from-left",
	"from-right",
	"from-top",
	"from-bottom",
];

// Unit vectors added to the sampling coordinate as the slide advances.
const OFFSETS: Record<BlurSlideDirection, [number, number]> = {
	"from-left": [1, 0],
	"from-right": [-1, 0],
	"from-top": [0, 1],
	"from-bottom": [0, -1],
};

const FIRST_SAMPLES = 32;
const SECOND_SAMPLES = 32;

const SMOOTHERSTEP = `
float smootherstep(float x) {
	return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}
float travelled() {
	return smootherstep(clamp(u_time, 0.0, 1.0));
}
float blurLength(float d) {
	return u_blur * 2.0 * min(d, 1.0 - d);
}
`;

// Measured on Remotion's renders (D-058): both scenes, repeated past their edges, move by one frame
// over the transition, eased with smootherstep; the travelled distance d sets a centered box blur
// along the slide of length 2 * blur * min(d, 1 - d) frames, and a crossfade smoothstep(0.3, 0.7, d)
// swaps the scenes in the middle, where the blur hides it. The first pass blurs with spaced samples
// into an 8-bit framebuffer; the second fills the gaps between them.
const FIRST_PASS = `
uniform vec2 u_offset;
uniform float u_blur;
${SMOOTHERSTEP}
void main() {
	float d = travelled();
	float len = blurLength(d);
	vec4 exiting = vec4(0.0);
	vec4 entering = vec4(0.0);
	for (int i = 0; i < ${FIRST_SAMPLES}; i++) {
		float o = float(i) / ${FIRST_SAMPLES - 1}.0 - 0.5;
		vec2 uv = v_uv + u_offset * (d + o * len);
		exiting += texture(u_next, uv);
		entering += texture(u_prev, uv);
	}
	outColor = mix(exiting, entering, smoothstep(0.3, 0.7, d)) / ${FIRST_SAMPLES}.0;
}`;

const SECOND_PASS = `
uniform vec2 u_offset;
uniform float u_blur;
uniform sampler2D u_first;
${SMOOTHERSTEP}
void main() {
	float step = blurLength(travelled()) / ${FIRST_SAMPLES - 1}.0;
	vec4 sum = vec4(0.0);
	for (int i = 0; i < ${SECOND_SAMPLES}; i++) {
		float o = float(i) / ${SECOND_SAMPLES - 1}.0 - 0.5;
		// The framebuffer's rows run bottom to top.
		vec2 p = v_uv + u_offset * o * step;
		sum += texture(u_first, vec2(p.x, 1.0 - p.y));
	}
	outColor = sum / ${SECOND_SAMPLES}.0;
}`;

/** The shader behind `blurSlide()`: two passes through an intermediate framebuffer. */
export const blurSlideShader: HtmlInCanvasShader<BlurSlideProps> = (canvas) => {
	const name = "blurSlide()";
	const gl = getWebGl2(canvas, name);
	const first = createProgram(gl, name, QUAD_VERTEX, FRAGMENT_HEADER + FIRST_PASS);
	const second = createProgram(gl, name, QUAD_VERTEX, FRAGMENT_HEADER + SECOND_PASS);
	const buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
	const prev = createSceneTexture(gl, "repeat");
	const next = createSceneTexture(gl, "repeat");
	const intermediate = createSceneTexture(gl, "repeat");
	const framebuffer = gl.createFramebuffer();
	let size = "";
	const bindQuad = (program: WebGLProgram) => {
		gl.useProgram(program);
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		const position = gl.getAttribLocation(program, "a_pos");
		gl.enableVertexAttribArray(position);
		gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
	};
	const setCommon = (
		program: WebGLProgram,
		params: HtmlInCanvasShaderDrawParams<BlurSlideProps>,
	) => {
		const direction = params.passedProps.direction ?? "from-left";
		gl.uniform2fv(gl.getUniformLocation(program, "u_offset"), OFFSETS[direction]);
		gl.uniform1f(gl.getUniformLocation(program, "u_blur"), params.passedProps.blur ?? 0.5);
		gl.uniform1f(gl.getUniformLocation(program, "u_time"), effectiveTime(params));
		gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), params.width, params.height);
	};
	return {
		clear: () => {
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);
		},
		cleanup: () => {
			gl.deleteProgram(first);
			gl.deleteProgram(second);
			gl.deleteTexture(prev);
			gl.deleteTexture(next);
			gl.deleteTexture(intermediate);
			gl.deleteFramebuffer(framebuffer);
			gl.deleteBuffer(buffer);
		},
		draw: (params) => {
			const { width, height } = params;
			if (size !== `${width}x${height}`) {
				size = `${width}x${height}`;
				gl.bindTexture(gl.TEXTURE_2D, intermediate);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
				gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
				gl.framebufferTexture2D(
					gl.FRAMEBUFFER,
					gl.COLOR_ATTACHMENT0,
					gl.TEXTURE_2D,
					intermediate,
					0,
				);
			}
			gl.viewport(0, 0, width, height);
			gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);
			bindQuad(first);
			uploadScene(gl, 0, prev, params.prevImage);
			gl.uniform1i(gl.getUniformLocation(first, "u_prev"), 0);
			uploadScene(gl, 1, next, params.nextImage);
			gl.uniform1i(gl.getUniformLocation(first, "u_next"), 1);
			setCommon(first, params);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.clear(gl.COLOR_BUFFER_BIT);
			bindQuad(second);
			gl.activeTexture(gl.TEXTURE2);
			gl.bindTexture(gl.TEXTURE_2D, intermediate);
			gl.uniform1i(gl.getUniformLocation(second, "u_first"), 2);
			setCommon(second, params);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		},
	};
};

/**
 * Whips both scenes across the frame with a heavy motion blur, like a fast camera pan, easing in
 * and out of rest. An HTML-in-canvas presentation: the scenes are rasterised through Chrome's
 * HTML-in-canvas API, which Motio's renderer has.
 */
export const blurSlide: (
	props?: BlurSlideProps & HtmlInCanvasPresentationOptions,
) => TransitionPresentation<BlurSlideProps> = builtInPresentation(
	"blurSlide",
	blurSlideShader,
	(props) => {
		if (props.direction !== undefined && !DIRECTIONS.includes(props.direction)) {
			throw new TypeError(
				`blurSlide(): "direction" must be one of ${DIRECTIONS.map((d) => `"${d}"`).join(", ")}, got ${String(props.direction)}.`,
			);
		}
		assertFiniteOption("blurSlide", "blur", props.blur);
		if (props.blur !== undefined && props.blur < 0) {
			throw new RangeError(`blurSlide(): "blur" must be 0 or more, got ${props.blur}.`);
		}
	},
);
