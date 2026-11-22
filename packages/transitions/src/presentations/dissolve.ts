import {
	type HtmlInCanvasPresentationOptions,
	type HtmlInCanvasShader,
	unsupportedPresentation,
} from "../html-in-canvas/make-html-in-canvas-presentation.js";
import type { TransitionPresentation } from "../types.js";

/** Props of `dissolve()`. */
export type DissolveProps = {
	/** Width of the glowing burn edge, in luminance units. Default 0.1. */
	lineWidth?: number;
	/** Colour of the outer edge of the burn, as `#rrggbb`. Default `"#ff0000"`. */
	spreadColor?: string;
	/** Colour of the hot core of the burn, as `#rrggbb`. Default `"#e6e633"`. */
	hotColor?: string;
	/** Higher values darken the cooler areas. Default 5. */
	pow?: number;
	/** Glow of the edge; above 1 glows more. Default 1. */
	intensity?: number;
};

const stub = unsupportedPresentation<DissolveProps>("dissolve");

/**
 * Burns through the exiting scene with a glowing edge. An HTML-in-canvas presentation: Motio does not support HTML-in-canvas yet, so calling it
 * throws an `HtmlInCanvasUnsupportedError`.
 */
export const dissolve: (
	props?: DissolveProps & HtmlInCanvasPresentationOptions,
) => TransitionPresentation<DissolveProps> = stub.presentation;

/** The shader behind `dissolve()`; throws an `HtmlInCanvasUnsupportedError` when used. */
export const dissolveShader: HtmlInCanvasShader<DissolveProps> = stub.shader;
