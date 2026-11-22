import {
	type HtmlInCanvasPresentationOptions,
	type HtmlInCanvasShader,
	unsupportedPresentation,
} from "../html-in-canvas/make-html-in-canvas-presentation.js";
import type { TransitionPresentation } from "../types.js";

/** Props of `ripple()`. */
export type RippleProps = {
	/** Spatial frequency of the ripple wave. Default 100. */
	amplitude?: number;
	/** How fast the wave travels outward. Default 50. */
	speed?: number;
};

const stub = unsupportedPresentation<RippleProps>("ripple");

/**
 * Ripples from the centre into the entering scene. An HTML-in-canvas presentation: Motio does not support HTML-in-canvas yet, so calling it
 * throws an `HtmlInCanvasUnsupportedError`.
 */
export const ripple: (
	props?: RippleProps & HtmlInCanvasPresentationOptions,
) => TransitionPresentation<RippleProps> = stub.presentation;

/** The shader behind `ripple()`; throws an `HtmlInCanvasUnsupportedError` when used. */
export const rippleShader: HtmlInCanvasShader<RippleProps> = stub.shader;
