import type { HtmlInCanvasShader } from "@remotion/transitions";

// The minimal crossfade shader of the makeHtmlInCanvasPresentation() documentation.
const VERTEX = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_prev;
uniform sampler2D u_next;
uniform float u_time;
in vec2 v_uv;
out vec4 outColor;
void main() {
  outColor = mix(texture(u_next, v_uv), texture(u_prev, v_uv), u_time);
}`;

export const crossfadeShader: HtmlInCanvasShader<Record<string, never>> = (canvas) => {
	const gl = canvas.getContext("webgl2", { premultipliedAlpha: true }) as WebGL2RenderingContext;
	const compile = (src: string, type: number) => {
		const sh = gl.createShader(type) as WebGLShader;
		gl.shaderSource(sh, src);
		gl.compileShader(sh);
		return sh;
	};
	const program = gl.createProgram();
	gl.attachShader(program, compile(VERTEX, gl.VERTEX_SHADER));
	gl.attachShader(program, compile(FRAGMENT, gl.FRAGMENT_SHADER));
	gl.linkProgram(program);
	const buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
	const aPos = gl.getAttribLocation(program, "a_pos");
	gl.enableVertexAttribArray(aPos);
	gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
	const prevTex = gl.createTexture();
	const nextTex = gl.createTexture();
	return {
		clear: () => {
			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);
		},
		cleanup: () => {
			gl.deleteProgram(program);
			gl.deleteTexture(prevTex);
			gl.deleteTexture(nextTex);
			gl.deleteBuffer(buffer);
		},
		draw: ({ prevImage, nextImage, width, height, time }) => {
			gl.viewport(0, 0, width, height);
			gl.useProgram(program);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, prevTex);
			if (prevImage) {
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, prevImage);
			}
			gl.uniform1i(gl.getUniformLocation(program, "u_prev"), 0);
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, nextTex);
			if (nextImage) {
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, nextImage);
			}
			gl.uniform1i(gl.getUniformLocation(program, "u_next"), 1);
			const t = !prevImage ? 0 : !nextImage ? 1 : time;
			gl.uniform1f(gl.getUniformLocation(program, "u_time"), t);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		},
	};
};
