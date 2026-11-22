import {
	type HtmlInCanvasPresentationOptions,
	type HtmlInCanvasShader,
	unsupportedPresentation,
} from "../html-in-canvas/make-html-in-canvas-presentation.js";
import type { TransitionPresentation } from "../types.js";

/** Where the page of `bookFlip()` is turned from. */
export type BookFlipDirection = "from-left" | "from-right" | "from-top" | "from-bottom";

/** Props of `bookFlip()`. */
export type BookFlipProps = {
	/** Side the page turns from. Default `"from-right"`. */
	direction?: BookFlipDirection;
};

const stub = unsupportedPresentation<BookFlipProps>("bookFlip");

/**
 * Turns the exiting scene like the page of a book. An HTML-in-canvas presentation: Motio does not support HTML-in-canvas yet, so calling it
 * throws an `HtmlInCanvasUnsupportedError`.
 */
export const bookFlip: (
	props?: BookFlipProps & HtmlInCanvasPresentationOptions,
) => TransitionPresentation<BookFlipProps> = stub.presentation;

/** The shader behind `bookFlip()`; throws an `HtmlInCanvasUnsupportedError` when used. */
export const bookFlipShader: HtmlInCanvasShader<BookFlipProps> = stub.shader;
