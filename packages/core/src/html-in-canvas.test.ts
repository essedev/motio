import { afterEach, describe, expect, it, vi } from "vitest";
import oracle from "./__oracle__/html-in-canvas-supported.json" with { type: "json" };
import { isHtmlInCanvasSupported } from "./html-in-canvas.js";

afterEach(() => {
	vi.unstubAllGlobals();
});

/** Stubs the browser globals, with or without the HTML-in-canvas additions. */
function stubBrowser(withApi: boolean): void {
	class Canvas {}
	class Context {}
	if (withApi) {
		Object.assign(Canvas.prototype, { requestPaint() {} });
		Object.assign(Context.prototype, { drawElementImage() {} });
	}
	vi.stubGlobal("HTMLCanvasElement", Canvas);
	vi.stubGlobal("CanvasRenderingContext2D", Context);
	vi.stubGlobal("OffscreenCanvas", class {});
}

describe("isHtmlInCanvasSupported", () => {
	it("is false outside a browser, like the published function in Node", () => {
		expect(isHtmlInCanvasSupported()).toBe(false);
		expect(oracle.node).toBe(false);
	});

	it("is true where the API exists, as the published function reports in a render's page", () => {
		stubBrowser(true);
		expect(isHtmlInCanvasSupported()).toBe(true);
		expect(oracle.render.supported).toBe(true);
	});

	it("is false in a browser without the API", () => {
		stubBrowser(false);
		expect(isHtmlInCanvasSupported()).toBe(false);
	});
});
