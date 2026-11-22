import {
	type HtmlInCanvasPresentationOptions,
	type HtmlInCanvasShader,
	unsupportedPresentation,
} from "../html-in-canvas/make-html-in-canvas-presentation.js";
import type { TransitionPresentation } from "../types.js";

/** Props of `filmBurn()`. */
export type FilmBurnProps = {
	/** Seed of the noise of the burn pattern. Default 2.31. */
	seed?: number;
};

const stub = unsupportedPresentation<FilmBurnProps>("filmBurn");

/**
 * Burns between the scenes like old film. An HTML-in-canvas presentation: Motio does not support HTML-in-canvas yet, so calling it
 * throws an `HtmlInCanvasUnsupportedError`.
 */
export const filmBurn: (
	props?: FilmBurnProps & HtmlInCanvasPresentationOptions,
) => TransitionPresentation<FilmBurnProps> = stub.presentation;

/** The shader behind `filmBurn()`; throws an `HtmlInCanvasUnsupportedError` when used. */
export const filmBurnShader: HtmlInCanvasShader<FilmBurnProps> = stub.shader;
