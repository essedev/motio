import { describe, expect, it } from "vitest";
import { pngSize } from "./compare.js";
import { drawLabels } from "./labels.js";
import { encodeRgbaPng } from "./png.js";

describe("frame labels", () => {
	it("draws digits on a dark box and leaves the rest of the image alone", () => {
		const width = 20;
		const height = 10;
		const rgba = new Uint8Array(width * height * 4).fill(128);
		drawLabels(rgba, width, height, [{ x: 1, y: 1, text: "17" }], 1);
		const at = (x: number, y: number) => rgba[(y * width + x) * 4];
		// The box is (4 * 2 + 1) x 7 dots; "1" has its top-middle dot set, "7" its top row.
		expect(at(1, 1)).toBe(0);
		expect(at(3, 2)).toBe(255);
		expect(at(2, 2)).toBe(0);
		expect([at(6, 2), at(7, 2), at(8, 2)]).toEqual([255, 255, 255]);
		expect(at(10, 1)).toBe(128);
		expect(at(1, 8)).toBe(128);
	});

	it("clips labels at the image edge", () => {
		const rgba = new Uint8Array(4 * 4 * 4);
		expect(() => drawLabels(rgba, 4, 4, [{ x: 2, y: 2, text: "999" }], 2)).not.toThrow();
	});

	it("encodes RGBA as a PNG of the right size", () => {
		const png = encodeRgbaPng(new Uint8Array(3 * 2 * 4), 3, 2);
		expect(pngSize(png)).toEqual({ width: 3, height: 2 });
		expect(() => encodeRgbaPng(new Uint8Array(5), 3, 2)).toThrow(/Expected 24 bytes/);
	});
});
