import type { TransitionPresentation } from "../types.js";
import {
	type HtmlInCanvasPresentationOptions,
	type HtmlInCanvasShader,
	makeHtmlInCanvasPresentation,
} from "./make-html-in-canvas-presentation.js";

/** How a shader written for the gl-transitions conventions is wired to the two scenes. */
export interface GlTransitionWiring {
	/**
	 * Which scene is gl-transitions' "from" scene. `"exiting"`: `getFromColor()` reads the exiting
	 * scene and `progress` is `u_time`. `"entering"`: `getFromColor()` reads the entering scene and
	 * `progress` is `1 - u_time`, the reverse.
	 */
	from: "exiting" | "entering";
	/** Whether `uv` runs bottom to top, as in gl-transitions' own player, instead of top to bottom. */
	flipY: boolean;
}

/**
 * Wraps the GLSL of a gl-transitions shader (which defines `vec4 transition(vec2 uv)` and uses
 * `getFromColor()`, `getToColor()`, `progress` and `ratio`) into the body of a built-in
 * presentation's fragment shader. Each built-in presentation was measured against Remotion's
 * renders to find its wiring.
 */
export function glTransition(body: string, wiring: GlTransitionWiring): string {
	const [from, to] = wiring.from === "exiting" ? ["u_next", "u_prev"] : ["u_prev", "u_next"];
	const sample = wiring.flipY ? "vec2(uv.x, 1.0 - uv.y)" : "uv";
	return `
float progress;
float ratio;
vec4 getFromColor(vec2 uv) { return texture(${from}, ${sample}); }
vec4 getToColor(vec2 uv) { return texture(${to}, ${sample}); }
${body.trim()}
void main() {
	progress = ${wiring.from === "exiting" ? "u_time" : "1.0 - u_time"};
	ratio = u_resolution.x / u_resolution.y;
	outColor = transition(${wiring.flipY ? "vec2(v_uv.x, 1.0 - v_uv.y)" : "v_uv"});
}`;
}

/** Throws a `TypeError` naming the option unless `value` is undefined or a finite number. */
export function assertFiniteOption(name: string, option: string, value: unknown): void {
	if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
		throw new TypeError(`${name}(): "${option}" must be a finite number, got ${String(value)}.`);
	}
}

/**
 * A built-in HTML-in-canvas presentation: `validate` checks the presentation's own props when it
 * is created, then the props are passed to `shader` on every draw.
 */
export function builtInPresentation<Props extends Record<string, unknown>>(
	name: string,
	shader: HtmlInCanvasShader<Props>,
	validate?: (props: Props) => void,
): (props?: Props & HtmlInCanvasPresentationOptions) => TransitionPresentation<Props> {
	const make = makeHtmlInCanvasPresentation(shader, `${name}()`);
	return (props) => {
		validate?.((props ?? {}) as Props);
		return make(props);
	};
}
