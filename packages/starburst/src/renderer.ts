import type { StarburstParams } from "./validate.js";

// One full-screen triangle; every pixel is computed from its center in the fragment shader.
const VERTEX = `#version 300 es
void main() {
	vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
	gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

// The ray of a pixel is the angle around the origin, in pixel space, counted counterclockwise
// from the left (-PI) plus the rotation, without wrapping, and split into `rays` equal sectors; the
// ray index wraps after `rays` sectors, and rays take the colors in turn by their index. A sector shows
// its color; with smoothness its edges fade toward the colors of the neighbouring rays (the
// previous ray at its start, the next at its end), over half the smoothness of a sector each. At
// smoothness 0 the edge weight is 1 off the boundaries, so a sector shows the color of the previous
// ray.
// These rules, and the vignette's falloff and alpha, were measured on Remotion's renders.
const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uSize;
uniform vec2 uOrigin;
uniform float uRays;
uniform float uRotation; // radians
uniform float uHalfSmoothness;
uniform float uVignette;
uniform int uCount;
uniform sampler2D uColors;
out vec4 outColor;

const float PI = 3.14159265358979323846;

float edge(float d) {
	// A smoothstep from the half smoothness down to 0; at smoothness 0 it is 1 off the boundary and
	// 0 exactly on it (Remotion's renders show the sector's own color on exact boundaries).
	if (uHalfSmoothness <= 0.0) return d > 0.0 ? 1.0 : 0.0;
	float t = clamp((d - uHalfSmoothness) / (0.0 - uHalfSmoothness), 0.0, 1.0);
	return t * t * (3.0 - 2.0 * t);
}

void main() {
	vec2 uv = gl_FragCoord.xy / uSize;
	float aspect = uSize.x / uSize.y;
	vec2 d = (uv - uOrigin) * vec2(aspect, 1.0);
	float p = (atan(d.y, d.x) + uRotation + PI) / (2.0 * PI) * uRays;
	float k = floor(p);
	float f = p - k;
	// The ray index wraps after a full turn of rays (exact for whole ray counts; for fractional
	// counts Remotion's colors differ once the rotation moves rays past the left seam).
	float ray = floor(mod(k, uRays));
	float count = float(uCount);
	vec3 current = texelFetch(uColors, ivec2(int(mod(ray, count)), 0), 0).rgb;
	vec3 previous = texelFetch(uColors, ivec2(int(mod(ray - 1.0, count)), 0), 0).rgb;
	vec3 next = texelFetch(uColors, ivec2(int(mod(ray + 1.0, count)), 0), 0).rgb;
	vec3 color = mix(current, next, edge(ceil(p) - p));
	color = mix(color, previous, edge(f));
	if (uVignette > 0.0) {
		float r = length((uv - 0.5) * vec2(aspect, 1.0));
		float t = clamp((r - 1.5 * uVignette) / (1.5 * uVignette), 0.0, 1.0);
		float keep = 1.0 - t * t * (3.0 - 2.0 * t);
		outColor = vec4(color * keep * keep * keep, keep * keep);
	} else {
		outColor = vec4(color, 1.0);
	}
}`;

/** Draws starbursts on one canvas through WebGL 2. */
export interface StarburstRenderer {
	draw(params: StarburstParams): void;
	/** Frees the GPU objects and the context. */
	dispose(): void;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
	const shader = gl.createShader(type);
	if (!shader) throw new Error("<Starburst>: WebGL could not create a shader.");
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		throw new Error(`<Starburst>: the shader did not compile: ${gl.getShaderInfoLog(shader)}`);
	}
	return shader;
}

/**
 * Creates the WebGL 2 program of `<Starburst>` on `canvas`. The output is premultiplied (the
 * canvas default), opaque without vignette. Throws when the browser offers no WebGL 2.
 */
export function createStarburstRenderer(canvas: HTMLCanvasElement): StarburstRenderer {
	const gl = canvas.getContext("webgl2", {
		alpha: true,
		premultipliedAlpha: true,
		antialias: false,
		depth: false,
		stencil: false,
		preserveDrawingBuffer: true,
	});
	if (!gl) {
		throw new Error(
			'<Starburst> needs WebGL 2, which this browser does not offer. Motio\'s renderer enables it by default (chromiumOptions.gl "swangle").',
		);
	}
	const program = gl.createProgram();
	gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
	gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		throw new Error(
			`<Starburst>: the shader program did not link: ${gl.getProgramInfoLog(program)}`,
		);
	}
	const texture = gl.createTexture();
	const vao = gl.createVertexArray();
	const uniform = (name: string) => gl.getUniformLocation(program, name);
	const locations = {
		size: uniform("uSize"),
		origin: uniform("uOrigin"),
		rays: uniform("uRays"),
		rotation: uniform("uRotation"),
		halfSmoothness: uniform("uHalfSmoothness"),
		vignette: uniform("uVignette"),
		count: uniform("uCount"),
		colors: uniform("uColors"),
	};

	return {
		draw(params) {
			const { width, height } = canvas;
			gl.viewport(0, 0, width, height);
			// biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook
			gl.useProgram(program);
			gl.bindVertexArray(vao);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			const data = new Uint8Array(params.colors.length * 4);
			for (const [i, [r, g, b]] of params.colors.entries()) data.set([r, g, b, 255], i * 4);
			gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA8,
				params.colors.length,
				1,
				0,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				data,
			);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.uniform1i(locations.colors, 0);
			gl.uniform1i(locations.count, params.colors.length);
			gl.uniform2f(locations.size, width, height);
			// The shader works with y up; the origin is given with y down.
			gl.uniform2f(locations.origin, params.origin[0], 1 - params.origin[1]);
			gl.uniform1f(locations.rays, params.rays);
			gl.uniform1f(locations.rotation, (params.rotation * Math.PI) / 180);
			gl.uniform1f(locations.halfSmoothness, params.smoothness / 2);
			gl.uniform1f(locations.vignette, params.vignette ?? 0);
			gl.disable(gl.BLEND);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
		},
		dispose() {
			gl.deleteTexture(texture);
			gl.deleteVertexArray(vao);
			gl.deleteProgram(program);
			gl.getExtension("WEBGL_lose_context")?.loseContext();
		},
	};
}
