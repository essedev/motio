import { describe, expect, it } from "vitest";
import { dissolve, dissolveShader } from "../presentations/dissolve.js";
import { zoomInOut } from "../presentations/zoom-in-out.js";
import {
	HTML_IN_CANVAS_UNSUPPORTED,
	HtmlInCanvasUnsupportedError,
	makeHtmlInCanvasPresentation,
} from "./make-html-in-canvas-presentation.js";

describe("HTML-in-canvas presentations", () => {
	it("can be imported and made, and throw a coded error only when used", () => {
		const custom = makeHtmlInCanvasPresentation(() => ({
			clear: () => {},
			cleanup: () => {},
			draw: () => {},
		}));
		expect(() => custom()).toThrow(HtmlInCanvasUnsupportedError);
		expect(() => dissolve({ lineWidth: 0.2 })).toThrow(/dissolve\(\) draws the scenes on a canvas/);
		expect(() => zoomInOut()).toThrow(/Use a CSS presentation instead/);
		try {
			dissolveShader({} as HTMLCanvasElement);
		} catch (error) {
			expect((error as HtmlInCanvasUnsupportedError).code).toBe(HTML_IN_CANVAS_UNSUPPORTED);
		}
		expect.assertions(4);
	});

	it("rejects a shader that is not a function", () => {
		expect(() => makeHtmlInCanvasPresentation(3 as never)).toThrow(/must be a function/);
	});
});
