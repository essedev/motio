import type { TransitionPresentation } from "../types.js";

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
	/** Progress of the transition, from 0 (start) to 1 (end). */
	time: number;
	/** Captured pixels per CSS pixel. */
	pixelRatio: number;
	/** Length of the transition in frames. */
	presentationDurationInFrames: number;
	/** The props of the presentation. */
	passedProps: Props;
}

/** Draws one frame of an HTML-in-canvas transition. */
export type HtmlInCanvasShaderDraw<Props> = (params: HtmlInCanvasShaderDrawParams<Props>) => void;

/**
 * A transition effect drawn on a canvas: receives the canvas and returns `clear()` (nothing to
 * draw), `cleanup()` (the transition unmounts) and `draw()` (every frame of the transition).
 */
export type HtmlInCanvasShader<Props> = (canvas: HTMLCanvasElement) => {
	clear: () => void;
	cleanup: () => void;
	draw: HtmlInCanvasShaderDraw<Props>;
};

/** Options that every HTML-in-canvas presentation accepts besides its own props. */
export type HtmlInCanvasPresentationOptions = {
	/** Effects applied after the shader. Default: none. */
	effects?: readonly unknown[];
	/** Resolution of the effects, in pixels. Does not change the output size. */
	effectsOutputSize?: { width: number; height: number };
};

/** Error code thrown when an HTML-in-canvas presentation is used. */
export const HTML_IN_CANVAS_UNSUPPORTED = "E_HTML_IN_CANVAS_UNSUPPORTED";

/** Thrown when an HTML-in-canvas presentation is used: Motio does not render them yet. */
export class HtmlInCanvasUnsupportedError extends Error {
	readonly code = HTML_IN_CANVAS_UNSUPPORTED;
	constructor(name: string) {
		super(
			`${name} draws the scenes on a canvas with HTML-in-canvas, which Motio does not support yet. ` +
				"Use a CSS presentation instead: fade(), slide(), wipe(), flip(), clockWipe(), iris(), cube(), pushCut() or none().",
		);
		this.name = "HtmlInCanvasUnsupportedError";
	}
}

/**
 * Turns a canvas shader into a presentation for `<TransitionSeries.Transition>`. Motio does not
 * support HTML-in-canvas yet: creating the shader's presentation (calling the returned function)
 * throws an `HtmlInCanvasUnsupportedError`.
 */
export function makeHtmlInCanvasPresentation<Props extends Record<string, unknown>>(
	shader: HtmlInCanvasShader<Props>,
): (props?: Props & HtmlInCanvasPresentationOptions) => TransitionPresentation<Props> {
	if (typeof shader !== "function") {
		throw new TypeError(
			`makeHtmlInCanvasPresentation(): the shader must be a function, got ${typeof shader}.`,
		);
	}
	return () => {
		throw new HtmlInCanvasUnsupportedError(
			"A presentation made with makeHtmlInCanvasPresentation()",
		);
	};
}

/**
 * A built-in HTML-in-canvas presentation and its shader, both stubs that throw an
 * `HtmlInCanvasUnsupportedError` when used.
 */
export function unsupportedPresentation<Props extends Record<string, unknown>>(
	name: string,
): {
	presentation: (props?: Props & HtmlInCanvasPresentationOptions) => TransitionPresentation<Props>;
	shader: HtmlInCanvasShader<Props>;
} {
	return {
		presentation: () => {
			throw new HtmlInCanvasUnsupportedError(`${name}()`);
		},
		shader: () => {
			throw new HtmlInCanvasUnsupportedError(`${name}Shader`);
		},
	};
}
