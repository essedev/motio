import {
	type HtmlInCanvasPresentationOptions,
	type HtmlInCanvasShader,
	unsupportedPresentation,
} from "../html-in-canvas/make-html-in-canvas-presentation.js";
import type { TransitionPresentation } from "../types.js";

/** Props of `swap()`. */
export type SwapProps = {
	/** Strength of the reflection on the floor. Default 0.4. */
	reflection?: number;
	/** Perspective distortion while the scenes move. Default 0.2. */
	perspective?: number;
	/** How far each scene moves into depth. Default 3. */
	depth?: number;
};

const stub = unsupportedPresentation<SwapProps>("swap");

/**
 * Swaps the scenes with perspective, depth and a floor reflection. An HTML-in-canvas presentation: Motio does not support HTML-in-canvas yet, so calling it
 * throws an `HtmlInCanvasUnsupportedError`.
 */
export const swap: (
	props?: SwapProps & HtmlInCanvasPresentationOptions,
) => TransitionPresentation<SwapProps> = stub.presentation;

/** The shader behind `swap()`; throws an `HtmlInCanvasUnsupportedError` when used. */
export const swapShader: HtmlInCanvasShader<SwapProps> = stub.shader;
