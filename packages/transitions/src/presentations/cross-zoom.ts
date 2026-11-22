import {
	type HtmlInCanvasPresentationOptions,
	type HtmlInCanvasShader,
	unsupportedPresentation,
} from "../html-in-canvas/make-html-in-canvas-presentation.js";
import type { TransitionPresentation } from "../types.js";

/** Props of `crossZoom()`. */
export type CrossZoomProps = {
	/** Amount of zoom blur. Default 0.4. */
	strength?: number;
};

const stub = unsupportedPresentation<CrossZoomProps>("crossZoom");

/**
 * Zooms between the scenes with a zoom blur. An HTML-in-canvas presentation: Motio does not support HTML-in-canvas yet, so calling it
 * throws an `HtmlInCanvasUnsupportedError`.
 */
export const crossZoom: (
	props?: CrossZoomProps & HtmlInCanvasPresentationOptions,
) => TransitionPresentation<CrossZoomProps> = stub.presentation;

/** The shader behind `crossZoom()`; throws an `HtmlInCanvasUnsupportedError` when used. */
export const crossZoomShader: HtmlInCanvasShader<CrossZoomProps> = stub.shader;
