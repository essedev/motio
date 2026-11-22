import {
	type HtmlInCanvasPresentationOptions,
	type HtmlInCanvasShader,
	unsupportedPresentation,
} from "../html-in-canvas/make-html-in-canvas-presentation.js";
import type { TransitionPresentation } from "../types.js";

/** Props of `crosswarp()`. */
export type CrosswarpProps = Record<string, never>;

const stub = unsupportedPresentation<CrosswarpProps>("crosswarp");

/**
 * Warps the exiting scene into the entering one. An HTML-in-canvas presentation: Motio does not support HTML-in-canvas yet, so calling it
 * throws an `HtmlInCanvasUnsupportedError`.
 */
export const crosswarp: (
	props?: CrosswarpProps & HtmlInCanvasPresentationOptions,
) => TransitionPresentation<CrosswarpProps> = stub.presentation;

/** The shader behind `crosswarp()`; throws an `HtmlInCanvasUnsupportedError` when used. */
export const crosswarpShader: HtmlInCanvasShader<CrosswarpProps> = stub.shader;
