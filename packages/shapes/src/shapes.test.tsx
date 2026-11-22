import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Circle, makeCircle, makePie, makeRect, makeStar, makeTriangle, Rect } from "./index.js";

describe("shapes (documented examples)", () => {
	it("generates the documented paths", () => {
		expect(makeRect({ width: 100, height: 100 }).path).toBe(
			"M 0 0 L 100 0 L 100 100 L 0 100 L 0 0 Z",
		);
		expect(makeCircle({ radius: 50 })).toMatchObject({
			path: "M 50 0 a 50 50 0 1 1 0 100 a 50 50 0 1 1 0 -100 Z",
			width: 100,
			transformOrigin: "50 50",
		});
		expect(makePie({ radius: 100, progress: 0.5 }).path).toBe(
			"M 100 0 A 100 100 0 0 1 100 200 L 100 100 Z",
		);
		expect(makeTriangle({ length: 100, direction: "right" }).transformOrigin).toBe(
			"28.867513459481287 50",
		);
		expect(makeStar({ innerRadius: 150, outerRadius: 200, points: 5 }).width).toBe(
			380.42260651806146,
		);
	});

	it("rejects corner radius and edge roundness together", () => {
		expect(() => makeRect({ width: 10, height: 10, cornerRadius: 2, edgeRoundness: 1 })).toThrow(
			"cannot be specified at the same time",
		);
	});

	it("renders an svg sized to the shape, forwarding path props", () => {
		const markup = renderToStaticMarkup(<Rect width={10} height={5} fill="red" />);
		expect(markup).toBe(
			'<svg width="10" height="5" viewBox="0 0 10 5" xmlns="http://www.w3.org/2000/svg" style="overflow:visible"><path transform-origin="5 2.5" d="M 0 0 L 10 0 L 10 5 L 0 5 L 0 0 Z" style="transform-box:fill-box" fill="red"></path></svg>',
		);
	});

	it("throws on effects, which Motio does not support", () => {
		expect(() => renderToStaticMarkup(<Circle radius={5} effects={[{}]} />)).toThrow(
			"Shape effects are not supported",
		);
	});
});
