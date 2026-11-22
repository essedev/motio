import {
	type HtmlInCanvasPresentationOptions,
	type HtmlInCanvasShader,
	unsupportedPresentation,
} from "../html-in-canvas/make-html-in-canvas-presentation.js";
import type { TransitionPresentation } from "../types.js";

/** Props of `linearBlur()`. */
export type LinearBlurProps = {
	/** How far the blur samples spread. Default 0.1. */
	intensity?: number;
};

const stub = unsupportedPresentation<LinearBlurProps>("linearBlur");

/**
 * Blurs between the scenes. An HTML-in-canvas presentation: Motio does not support HTML-in-canvas yet, so calling it
 * throws an `HtmlInCanvasUnsupportedError`.
 */
export const linearBlur: (
	props?: LinearBlurProps & HtmlInCanvasPresentationOptions,
) => TransitionPresentation<LinearBlurProps> = stub.presentation;

/** The shader behind `linearBlur()`; throws an `HtmlInCanvasUnsupportedError` when used. */
export const linearBlurShader: HtmlInCanvasShader<LinearBlurProps> = stub.shader;
