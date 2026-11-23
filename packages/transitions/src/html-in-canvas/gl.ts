import type {
	HtmlInCanvasShader,
	HtmlInCanvasShaderDrawParams,
} from "./make-html-in-canvas-presentation.js";

/** Vertex shader of every built-in presentation: a full-canvas quad, `v_uv` (0, 0) at the top left. */
export const QUAD_VERTEX = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
	v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
	gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

/**
 * Declarations shared by the fragment shaders of the built-in presentations: the entering scene
 * (`u_prev`), the exiting scene (`u_next`), the time (0 shows the exiting scene, 1 the entering one)
 * and the canvas size in pixels.
 */
export const FRAGMENT_HEADER = `#version 300 es
precision highp float;
uniform sampler2D u_prev;
uniform sampler2D u_next;
uniform float u_time;
uniform vec2 u_resolution;
in vec2 v_uv;
out vec4 outColor;
`;

/** Sets the uniforms of a presentation's own props before each draw. */
export type SetUniforms<Props> = (
	gl: WebGL2RenderingContext,
	location: (name: string) => WebGLUniformLocation | null,
	params: HtmlInCanvasShaderDrawParams<Props>,
) => void;

/** Compiles and links a program; throws with the info log when either step fails. */
export function createProgram(
	gl: WebGL2RenderingContext,
	name: string,
	vertex: string,
	fragment: string,
): WebGLProgram {
	const compile = (type: number, source: string) => {
		const shader = gl.createShader(type);
		if (!shader) throw new Error(`${name}: WebGL could not create a shader.`);
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
			throw new Error(`${name}: the shader did not compile: ${gl.getShaderInfoLog(shader)}`);
		}
		return shader;
	};
	const program = gl.createProgram();
	if (!program) throw new Error(`${name}: WebGL could not create a program.`);
	const vs = compile(gl.VERTEX_SHADER, vertex);
	const fs = compile(gl.FRAGMENT_SHADER, fragment);
	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);
	gl.deleteShader(vs);
	gl.deleteShader(fs);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
		throw new Error(`${name}: the shader did not link: ${gl.getProgramInfoLog(program)}`);
	}
	return program;
}

/** Gets a WebGL 2 context with premultiplied alpha, or throws saying why it is needed. */
export function getWebGl2(canvas: OffscreenCanvas, name: string): WebGL2RenderingContext {
	const gl = canvas.getContext("webgl2", { premultipliedAlpha: true });
	if (!gl) {
		throw new Error(
			`${name}: WebGL 2 is not available in this browser, and the presentation draws with it. Render with a WebGL-capable Chrome (the default renderer has it).`,
		);
	}
	return gl;
}

/** How a scene texture is sampled outside its edges. */
export type SceneWrap = "clamp" | "repeat";

/** Creates a texture that samples with linear filtering and clamps (or repeats) at the edges. */
export function createSceneTexture(
	gl: WebGL2RenderingContext,
	wrap: SceneWrap = "clamp",
): WebGLTexture {
	const texture = gl.createTexture();
	if (!texture) throw new Error("WebGL could not create a texture.");
	const mode = wrap === "repeat" ? gl.REPEAT : gl.CLAMP_TO_EDGE;
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, mode);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, mode);
	return texture;
}

/** Binds `texture` to `unit` and uploads `image` into it when there is one. */
export function uploadScene(
	gl: WebGL2RenderingContext,
	unit: number,
	texture: WebGLTexture,
	image: OffscreenCanvas | null,
): void {
	gl.activeTexture(gl.TEXTURE0 + unit);
	gl.bindTexture(gl.TEXTURE_2D, texture);
	if (image) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
}

/**
 * The time a shader should use: with one scene missing, the end of the transition that shows the
 * scene that is there (0 for the exiting scene alone, 1 for the entering one).
 */
export function effectiveTime(params: HtmlInCanvasShaderDrawParams<unknown>): number {
	if (!params.prevImage) return 0;
	if (!params.nextImage) return 1;
	return params.time;
}

/**
 * Builds the shader of a single-pass built-in presentation: `fragment` (after `FRAGMENT_HEADER`)
 * draws a full-canvas quad from the two scene textures, and `setUniforms` passes the props.
 */
export function createQuadShader<Props>(
	name: string,
	fragment: string,
	setUniforms?: SetUniforms<Props>,
	wrap: SceneWrap = "clamp",
): HtmlInCanvasShader<Props> {
	return (canvas) => {
		const gl = getWebGl2(canvas, name);
		const program = createProgram(gl, name, QUAD_VERTEX, FRAGMENT_HEADER + fragment);
		const buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
		const position = gl.getAttribLocation(program, "a_pos");
		gl.enableVertexAttribArray(position);
		gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
		const prev = createSceneTexture(gl, wrap);
		const next = createSceneTexture(gl, wrap);
		const locations = new Map<string, WebGLUniformLocation | null>();
		const location = (uniform: string) => {
			if (!locations.has(uniform)) locations.set(uniform, gl.getUniformLocation(program, uniform));
			return locations.get(uniform) ?? null;
		};
		return {
			clear: () => {
				gl.clearColor(0, 0, 0, 0);
				gl.clear(gl.COLOR_BUFFER_BIT);
			},
			cleanup: () => {
				gl.deleteProgram(program);
				gl.deleteTexture(prev);
				gl.deleteTexture(next);
				gl.deleteBuffer(buffer);
			},
			draw: (params) => {
				gl.viewport(0, 0, params.width, params.height);
				gl.clearColor(0, 0, 0, 0);
				gl.clear(gl.COLOR_BUFFER_BIT);
				gl.useProgram(program);
				uploadScene(gl, 0, prev, params.prevImage);
				gl.uniform1i(location("u_prev"), 0);
				uploadScene(gl, 1, next, params.nextImage);
				gl.uniform1i(location("u_next"), 1);
				gl.uniform1f(location("u_time"), effectiveTime(params));
				gl.uniform2f(location("u_resolution"), params.width, params.height);
				setUniforms?.(gl, location, params);
				gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			},
		};
	};
}
