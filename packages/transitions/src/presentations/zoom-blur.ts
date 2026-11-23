import { assertFiniteOption, builtInPresentation } from "../html-in-canvas/built-in.js";
import { createQuadShader } from "../html-in-canvas/gl.js";
import type {
	HtmlInCanvasPresentationOptions,
	HtmlInCanvasShader,
} from "../html-in-canvas/make-html-in-canvas-presentation.js";
import type { TransitionPresentation } from "../types.js";

/** Props of `zoomBlur()`. */
export type ZoomBlurProps = {
	/**
	 * Largest rotation of a scene, in radians: the exiting scene turns from 0 to `-rotation`, the
	 * entering one from `rotation` to 0. Default `Math.PI / 6`.
	 */
	rotation?: number;
};

// Measured on Remotion's renders (D-058): each scene turns about the center by `rotation` times
// its share of the transition (clockwise on screen for the exiting scene, counterclockwise for
// the entering one), is scaled just enough for the turned frame to cover the canvas, and is blurred
// toward the center over 16 samples spread evenly from the pixel to 35% of the way in, scaled by
// the same share; the scenes crossfade linearly.
const FRAGMENT = `
uniform float u_rotation;

vec4 turned(sampler2D scene, float share, float direction) {
	vec2 size = u_resolution;
	vec2 p = (v_uv - 0.5) * size;
	float angle = direction * u_rotation * share;
	float c = cos(angle);
	float s = sin(angle);
	float a = abs(angle);
	float zoom = cos(a) + max(size.x / size.y, size.y / size.x) * sin(a);
	float strength = 0.35 * share;
	vec4 sum = vec4(0.0);
	for (int i = 0; i < 16; i++) {
		vec2 q = p * (1.0 - strength * float(i) / 15.0);
		vec2 r = vec2(c * q.x + s * q.y, -s * q.x + c * q.y) / zoom;
		sum += texture(scene, r / size + 0.5);
	}
	return sum / 16.0;
}

void main() {
	outColor = mix(turned(u_next, u_time, 1.0), turned(u_prev, 1.0 - u_time, -1.0), u_time);
}`;

/** The shader behind `zoomBlur()`. */
export const zoomBlurShader: HtmlInCanvasShader<ZoomBlurProps> = createQuadShader(
	"zoomBlur()",
	FRAGMENT,
	(gl, location, { passedProps }) => {
		gl.uniform1f(location("u_rotation"), passedProps.rotation ?? Math.PI / 6);
	},
);

/**
 * The exiting scene turns and zooms away while the entering scene turns in from the opposite
 * angle, both blurred toward the center. An HTML-in-canvas presentation: the scenes are rasterised
 * through Chrome's HTML-in-canvas API, which Motio's renderer has.
 */
export const zoomBlur: (
	props?: ZoomBlurProps & HtmlInCanvasPresentationOptions,
) => TransitionPresentation<ZoomBlurProps> = builtInPresentation(
	"zoomBlur",
	zoomBlurShader,
	(props) => {
		assertFiniteOption("zoomBlur", "rotation", props.rotation);
	},
);
