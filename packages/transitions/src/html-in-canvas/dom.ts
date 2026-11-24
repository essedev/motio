// Chrome's HTML-in-canvas API (WICG html-in-canvas), which the DOM typings do not declare yet: a
// canvas with `content="drawable"` lays out its `drawable` children without painting them, fires
// `paint` when their rendering changes or `requestPaint()` asks for it, and its 2D context draws
// a child with `drawElementImage()`. chrome-headless-shell 158 offers it with default flags (D-057).

import { isHtmlInCanvasSupported } from "@motiojs/core";

/** A canvas element with the HTML-in-canvas additions. */
export interface DrawableCanvas extends HTMLCanvasElement {
	requestPaint(): void;
	onpaint: ((event: Event) => void) | null;
}

/** A 2D context with the HTML-in-canvas additions. */
export interface DrawableContext2D extends CanvasRenderingContext2D {
	drawElementImage(element: Element, x: number, y: number): unknown;
}

/** Whether this browser offers the HTML-in-canvas API. */
export function isHtmlInCanvasAvailable(): boolean {
	return isHtmlInCanvasSupported();
}
