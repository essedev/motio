import type { TransitionPresentation } from "../types.js";
import { createHtmlInCanvasComponent } from "./scene.js";

/** Arguments of the `draw()` callback of an HTML-in-canvas shader. */
export interface HtmlInCanvasShaderDrawParams<Props> {
	/** The entering scene, rasterised; null while it is not mounted or not rendered yet. */
	prevImage: OffscreenCanvas | null;
	/** The exiting scene, rasterised; null while it is not mounted or not rendered yet. */
	nextImage: OffscreenCanvas | null;
	/** Width of the canvas in pixels. */
	width: number;
	/** Height of the canvas in pixels. */
	height: number;
	/**
	 * Progress of the transition, from 0 (only the exiting scene, `nextImage`) to 1 (only the
	 * entering scene, `prevImage`). 0 while a scene is drawn alone, before or after its transition:
	 * the missing image says which end applies.
	 */
	time: number;
	/** Captured pixels per CSS pixel. */
	pixelRatio: number;
	/** Length of the transition in frames, whatever the current `time`. */
	presentationDurationInFrames: number;
	/** The props of the presentation. */
	passedProps: Props;
}

/** Draws one frame of an HTML-in-canvas transition. */
export type HtmlInCanvasShaderDraw<Props> = (params: HtmlInCanvasShaderDrawParams<Props>) => void;

/**
 * A transition effect drawn on a canvas: receives the offscreen canvas to draw on (sized before
 * every `draw()`) and returns `clear()` (nothing to draw), `cleanup()` (the transition unmounts)
 * and `draw()` (every frame the scene is shown).
 */
export type HtmlInCanvasShader<Props> = (canvas: OffscreenCanvas) => {
	clear: () => void;
	cleanup: () => void;
	draw: HtmlInCanvasShaderDraw<Props>;
};

/** Options that every HTML-in-canvas presentation accepts besides its own props. */
export type HtmlInCanvasPresentationOptions = {
	/** Effects applied after the shader. Motio has no effect pipeline yet: must be empty (D-057). */
	effects?: readonly unknown[];
	/** Resolution of the effects, in pixels. Does not change the output size. */
	effectsOutputSize?: { width: number; height: number };
};

/** Error code thrown when a presentation is given effects. */
export const HTML_IN_CANVAS_EFFECTS_UNSUPPORTED = "E_HTML_IN_CANVAS_EFFECTS_UNSUPPORTED";

/** Thrown when an HTML-in-canvas presentation is given `effects`, which Motio cannot apply yet. */
export class HtmlInCanvasEffectsUnsupportedError extends Error {
	readonly code = HTML_IN_CANVAS_EFFECTS_UNSUPPORTED;
	constructor(name: string) {
		super(
			`${name}: "effects" needs the effect pipeline of @remotion/effects, which Motio does not have yet. ` +
				"Remove the effects option, or apply the effect inside the scenes.",
		);
		this.name = "HtmlInCanvasEffectsUnsupportedError";
	}
}

function validateOptions(name: string, options: HtmlInCanvasPresentationOptions): void {
	const { effects, effectsOutputSize } = options;
	if (effects !== undefined) {
		if (!Array.isArray(effects)) {
			throw new TypeError(`${name}: "effects" must be an array, got ${typeof effects}.`);
		}
		if (effects.length > 0) throw new HtmlInCanvasEffectsUnsupportedError(name);
	}
	if (effectsOutputSize !== undefined) {
		const { width, height } = effectsOutputSize ?? {};
		for (const [key, value] of [
			["width", width],
			["height", height],
		] as const) {
			if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
				throw new TypeError(
					`${name}: "effectsOutputSize.${key}" must be a positive integer, got ${String(value)}.`,
				);
			}
		}
	}
}

/**
 * Turns a canvas shader into a presentation for `<TransitionSeries.Transition>`. Each scene next to
 * the transition is laid out inside a canvas through Chrome's HTML-in-canvas API and rasterised on
 * every frame; the entering scene's canvas runs the shader on both images while the transition
 * plays, and on its own image before or after it.
 */
export function makeHtmlInCanvasPresentation<Props extends Record<string, unknown>>(
	shader: HtmlInCanvasShader<Props>,
	name = "A presentation made with makeHtmlInCanvasPresentation()",
): (props?: Props & HtmlInCanvasPresentationOptions) => TransitionPresentation<Props> {
	if (typeof shader !== "function") {
		throw new TypeError(
			`makeHtmlInCanvasPresentation(): the shader must be a function, got ${typeof shader}.`,
		);
	}
	const component = createHtmlInCanvasComponent(shader);
	return (props) => {
		const passed = (props ?? {}) as Props & HtmlInCanvasPresentationOptions;
		validateOptions(name, passed);
		return {
			component,
			props: passed,
			canvas: shader,
		};
	};
}
