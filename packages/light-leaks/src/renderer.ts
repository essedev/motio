import { random } from "@motiojs/core";

const VERTEX = `#version 300 es
void main() {
	vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
	gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

// Motio's own light leak (Remotion's shader is not documented): a warm, domain-warped noise field
// leaning toward a seeded point on the edge, revealed by a threshold that falls as the progress
// nears 0.5 and rises again after it. Every value comes from the uniforms, so a frame always draws
// the same pixels. Output is premultiplied.
const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uSize;
uniform vec2 uOffset;
uniform vec2 uCenter;
uniform float uProgress;
uniform float uHueShift;
out vec4 outColor;

uint mixBits(uvec2 v) {
	uint h = (v.x * 0x8da6b343u) ^ (v.y * 0xd8163841u);
	h ^= h >> 15;
	h *= 0x2c1b3c6du;
	h ^= h >> 12;
	h *= 0x297a2d39u;
	h ^= h >> 15;
	return h;
}

float lattice(vec2 cell) {
	return float(mixBits(uvec2(ivec2(cell) + 4096))) / 4294967295.0;
}

float noise(vec2 p) {
	vec2 cell = floor(p);
	vec2 f = p - cell;
	vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
	float a = lattice(cell);
	float b = lattice(cell + vec2(1.0, 0.0));
	float c = lattice(cell + vec2(0.0, 1.0));
	float d = lattice(cell + vec2(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
	float sum = 0.0;
	float amplitude = 0.5;
	mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
	for (int i = 0; i < 3; i++) {
		sum += amplitude * noise(p);
		p = turn * p * 2.03 + 17.1;
		amplitude *= 0.5;
	}
	return sum / 0.875;
}

vec3 rotateHue(vec3 color, float degrees) {
	float angle = radians(degrees);
	vec3 axis = vec3(0.57735026919);
	float c = cos(angle);
	return color * c + cross(axis, color) * sin(angle) + axis * dot(axis, color) * (1.0 - c);
}

void main() {
	vec2 uv = gl_FragCoord.xy / uSize;
	float aspect = uSize.x / uSize.y;
	vec2 q = vec2(uv.x * aspect, uv.y);
	float amount = uProgress <= 0.5
		? smoothstep(0.12, 0.5, uProgress)
		: 1.0 - smoothstep(0.5, 0.95, uProgress);
	vec2 flow = vec2(0.35, -0.2) * uProgress;
	vec2 warp = vec2(fbm(q * 0.8 + uOffset), fbm(q * 0.8 + uOffset + 7.31));
	float shape = fbm(q * 0.7 + uOffset * 0.5 + 0.9 * warp + flow);
	vec2 center = uCenter * vec2(aspect, 1.0);
	float lean = 1.0 - distance(q, center) / (0.9 * max(aspect, 1.0));
	float field = 0.55 * shape + 0.75 * lean;
	float threshold = mix(1.15, -0.45, amount);
	float alpha = smoothstep(threshold, threshold + 0.28, field) * min(1.0, amount * 8.0);
	float tone = fbm(q * 0.6 + uOffset + 3.7 + 0.5 * warp);
	vec3 color = mix(vec3(0.92, 0.5, 0.1), vec3(1.0, 0.93, 0.3), smoothstep(0.25, 0.75, tone));
	color *= mix(0.55, 1.0, smoothstep(threshold, threshold + 0.6, field));
	// Remotion's renders turn the hue backward: 120 gives magenta, 240 cyan.
	color = clamp(rotateHue(color, -uHueShift), 0.0, 1.0);
	outColor = vec4(color * alpha, alpha);
}`;

/** What one light leak frame needs. */
export interface LightLeakFrame {
	seed: number;
	hueShift: number;
	/** From 0 to 1: reveals up to 0.5, retracts after. */
	progress: number;
}

/** Draws light leaks on one canvas through WebGL 2. */
export interface LightLeakRenderer {
	draw(frame: LightLeakFrame): void;
	/** Frees the GPU objects and the context. */
	dispose(): void;
}

/** Where the pattern of a seed sits in the noise, and the edge point it leans toward. */
export function seedPlacement(seed: number): {
	offset: [number, number];
	center: [number, number];
} {
	const angle = random(`light-leak-angle-${seed}`) * Math.PI * 2;
	return {
		offset: [random(`light-leak-x-${seed}`) * 64, random(`light-leak-y-${seed}`) * 64],
		center: [0.5 + 0.6 * Math.cos(angle), 0.5 + 0.6 * Math.sin(angle)],
	};
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
	const shader = gl.createShader(type);
	if (!shader) throw new Error("<LightLeak>: WebGL could not create a shader.");
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		throw new Error(`<LightLeak>: the shader did not compile: ${gl.getShaderInfoLog(shader)}`);
	}
	return shader;
}

/** Creates the WebGL 2 program of `<LightLeak>` on `canvas`. Throws without WebGL 2. */
export function createLightLeakRenderer(canvas: HTMLCanvasElement): LightLeakRenderer {
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
			'<LightLeak> needs WebGL 2, which this browser does not offer. Motio\'s renderer enables it by default (chromiumOptions.gl "swangle").',
		);
	}
	const program = gl.createProgram();
	gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
	gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		throw new Error(
			`<LightLeak>: the shader program did not link: ${gl.getProgramInfoLog(program)}`,
		);
	}
	const vao = gl.createVertexArray();
	const uniform = (name: string) => gl.getUniformLocation(program, name);
	const locations = {
		size: uniform("uSize"),
		offset: uniform("uOffset"),
		center: uniform("uCenter"),
		progress: uniform("uProgress"),
		hueShift: uniform("uHueShift"),
	};

	return {
		draw({ seed, hueShift, progress }) {
			const { width, height } = canvas;
			const { offset, center } = seedPlacement(seed);
			gl.viewport(0, 0, width, height);
			// biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook
			gl.useProgram(program);
			gl.bindVertexArray(vao);
			gl.uniform2f(locations.size, width, height);
			gl.uniform2f(locations.offset, offset[0], offset[1]);
			// The shader works with y up.
			gl.uniform2f(locations.center, center[0], 1 - center[1]);
			gl.uniform1f(locations.progress, progress);
			gl.uniform1f(locations.hueShift, hueShift);
			gl.disable(gl.BLEND);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
		},
		dispose() {
			gl.deleteVertexArray(vao);
			gl.deleteProgram(program);
			gl.getExtension("WEBGL_lose_context")?.loseContext();
		},
	};
}
