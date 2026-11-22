import {
	type HtmlInCanvasPresentationOptions,
	type HtmlInCanvasShader,
	unsupportedPresentation,
} from "../html-in-canvas/make-html-in-canvas-presentation.js";
import type { TransitionPresentation } from "../types.js";

/** Where the entering scene of `blurSlide()` comes from. */
export type BlurSlideDirection = "from-left" | "from-right" | "from-top" | "from-bottom";

/** Props of `blurSlide()`. */
export type BlurSlideProps = {
	/** Where the entering scene comes from. Default `"from-left"`. */
	direction?: BlurSlideDirection;
	/** Maximum length of the motion blur, as a fraction of the frame size. Default 0.5. */
	blur?: number;
};

const stub = unsupportedPresentation<BlurSlideProps>("blurSlide");

/**
 * Slides the scenes with motion blur. An HTML-in-canvas presentation: Motio does not support HTML-in-canvas yet, so calling it
 * throws an `HtmlInCanvasUnsupportedError`.
 */
export const blurSlide: (
	props?: BlurSlideProps & HtmlInCanvasPresentationOptions,
) => TransitionPresentation<BlurSlideProps> = stub.presentation;

/** The shader behind `blurSlide()`; throws an `HtmlInCanvasUnsupportedError` when used. */
export const blurSlideShader: HtmlInCanvasShader<BlurSlideProps> = stub.shader;
