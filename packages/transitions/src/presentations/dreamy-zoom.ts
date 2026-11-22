import {
	type HtmlInCanvasPresentationOptions,
	type HtmlInCanvasShader,
	unsupportedPresentation,
} from "../html-in-canvas/make-html-in-canvas-presentation.js";
import type { TransitionPresentation } from "../types.js";

/** Props of `dreamyZoom()`. */
export type DreamyZoomProps = {
	/** Rotation angle in degrees. Default 6. */
	rotation?: number;
	/** Zoom scale at the white flash in the middle. Default 1.2. */
	scale?: number;
};

const stub = unsupportedPresentation<DreamyZoomProps>("dreamyZoom");

/**
 * Zooms and rotates through a white flash. An HTML-in-canvas presentation: Motio does not support HTML-in-canvas yet, so calling it
 * throws an `HtmlInCanvasUnsupportedError`.
 */
export const dreamyZoom: (
	props?: DreamyZoomProps & HtmlInCanvasPresentationOptions,
) => TransitionPresentation<DreamyZoomProps> = stub.presentation;

/** The shader behind `dreamyZoom()`; throws an `HtmlInCanvasUnsupportedError` when used. */
export const dreamyZoomShader: HtmlInCanvasShader<DreamyZoomProps> = stub.shader;
