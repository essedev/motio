import {
	type HtmlInCanvasPresentationOptions,
	type HtmlInCanvasShader,
	unsupportedPresentation,
} from "../html-in-canvas/make-html-in-canvas-presentation.js";
import type { TransitionPresentation } from "../types.js";

/** Props of `zoomInOut()`. */
export type ZoomInOutProps = Record<string, never>;

const stub = unsupportedPresentation<ZoomInOutProps>("zoomInOut");

/**
 * The exiting scene zooms in and crossfades into the entering scene, which zooms back out. An HTML-in-canvas presentation: Motio does not support HTML-in-canvas yet, so calling it
 * throws an `HtmlInCanvasUnsupportedError`.
 */
export const zoomInOut: (
	props?: ZoomInOutProps & HtmlInCanvasPresentationOptions,
) => TransitionPresentation<ZoomInOutProps> = stub.presentation;

/** The shader behind `zoomInOut()`; throws an `HtmlInCanvasUnsupportedError` when used. */
export const zoomInOutShader: HtmlInCanvasShader<ZoomInOutProps> = stub.shader;
