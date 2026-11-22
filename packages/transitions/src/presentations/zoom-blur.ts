import {
	type HtmlInCanvasPresentationOptions,
	type HtmlInCanvasShader,
	unsupportedPresentation,
} from "../html-in-canvas/make-html-in-canvas-presentation.js";
import type { TransitionPresentation } from "../types.js";

/** Props of `zoomBlur()`. */
export type ZoomBlurProps = {
	/** Maximum rotation in radians of each scene. Default `Math.PI / 6`. */
	rotation?: number;
};

const stub = unsupportedPresentation<ZoomBlurProps>("zoomBlur");

/**
 * Zooms between the scenes with blur and rotation. An HTML-in-canvas presentation: Motio does not support HTML-in-canvas yet, so calling it
 * throws an `HtmlInCanvasUnsupportedError`.
 */
export const zoomBlur: (
	props?: ZoomBlurProps & HtmlInCanvasPresentationOptions,
) => TransitionPresentation<ZoomBlurProps> = stub.presentation;

/** The shader behind `zoomBlur()`; throws an `HtmlInCanvasUnsupportedError` when used. */
export const zoomBlurShader: HtmlInCanvasShader<ZoomBlurProps> = stub.shader;
