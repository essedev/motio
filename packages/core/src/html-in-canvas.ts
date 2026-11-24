/**
 * Whether the browser offers Chrome's HTML-in-canvas API (WICG html-in-canvas): a canvas that lays
 * out its children without painting them (`requestPaint()`), a 2D context that draws one
 * (`drawElementImage()`), and `OffscreenCanvas`. Code uses it to choose between an effect drawn
 * through the canvas and a plain DOM fallback.
 *
 * Synchronous. `false` outside a browser (Node, server rendering); in the pinned
 * chrome-headless-shell of a render it is `true`.
 */
export function isHtmlInCanvasSupported(): boolean {
	if (typeof HTMLCanvasElement === "undefined" || typeof CanvasRenderingContext2D === "undefined") {
		return false;
	}
	const canvas = HTMLCanvasElement.prototype as Partial<{ requestPaint: unknown }>;
	const context = CanvasRenderingContext2D.prototype as Partial<{ drawElementImage: unknown }>;
	return (
		typeof canvas.requestPaint === "function" &&
		typeof context.drawElementImage === "function" &&
		typeof OffscreenCanvas !== "undefined"
	);
}
