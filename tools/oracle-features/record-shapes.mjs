import {
	Arrow,
	Callout,
	Circle,
	Ellipse,
	Heart,
	makeArrow,
	makeCallout,
	makeCircle,
	makeEllipse,
	makeHeart,
	makePie,
	makePolygon,
	makeRect,
	makeSpark,
	makeStar,
	makeTriangle,
	Pie,
	Polygon,
	Rect,
	Spark,
	Star,
	Triangle,
} from "@remotion/shapes";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { capture, makeRng, writeFixture } from "./lib.mjs";

const PACKAGE = "@remotion/shapes";

const makeGenerators = (rng) => {
	const pick = (items) => items[Math.floor(rng() * items.length)];
	const num = (lo, hi) => Math.round((lo + rng() * (hi - lo)) * 100) / 100;
	const rounding = (o, radii, roundness) => {
		const r = rng();
		if (r < 0.3) o.cornerRadius = pick(radii);
		else if (r < 0.6) o.edgeRoundness = pick(roundness);
		return o;
	};
	return {
		makeRect: () =>
			rounding(
				{ width: num(0, 300), height: num(0, 300) },
				[0, 5, num(0, 200), -3],
				[0, 0.5, 1, 2, num(-1, 2), null],
			),
		makeCircle: () => ({ radius: num(0, 300) }),
		makeEllipse: () => ({ rx: num(0, 300), ry: num(0, 300) }),
		makePie: () => {
			const o = {
				radius: num(1, 300),
				progress: pick([0, 0.25, 0.5, 0.75, 1, num(-0.2, 1.2), num(0, 1)]),
			};
			if (rng() < 0.4) o.rotation = num(-7, 7);
			if (rng() < 0.3) o.counterClockwise = rng() < 0.5;
			if (rng() < 0.3) o.closePath = rng() < 0.5;
			return o;
		},
		makeTriangle: () =>
			rounding(
				{ length: num(1, 300), direction: pick(["up", "down", "left", "right"]) },
				[5, num(0, 100), -3],
				[0, 0.5, 1, num(-1, 2)],
			),
		makePolygon: () =>
			rounding(
				{ points: pick([3, 4, 5, 6, 7, 8, 12]), radius: num(1, 300) },
				[5, num(0, 50)],
				[0, 0.25, 0.5, 1, num(-1, 2)],
			),
		makeStar: () =>
			rounding(
				{ points: pick([3, 4, 5, 6, 8]), innerRadius: num(1, 150), outerRadius: num(1, 300) },
				[5, num(0, 30)],
				[0, 0.25, 0.5, 1, num(-1, 2)],
			),
		makeHeart: () => {
			const o = { height: num(1, 300) };
			if (rng() < 0.5) o.aspectRatio = num(0.5, 2);
			if (rng() < 0.5) o.bottomRoundnessAdjustment = num(-0.3, 0.3);
			if (rng() < 0.5) o.depthAdjustment = num(-0.3, 0.3);
			return o;
		},
		makeArrow: () => {
			const o = {};
			if (rng() < 0.7) {
				Object.assign(o, {
					length: num(50, 400),
					headWidth: num(20, 200),
					headLength: num(10, 150),
					shaftWidth: num(5, 100),
				});
			}
			if (rng() < 0.8) o.direction = pick(["up", "down", "left", "right"]);
			if (rng() < 0.4) o.cornerRadius = pick([5, num(0, 40)]);
			return o;
		},
		makeCallout: () => {
			const o = {};
			if (rng() < 0.7) {
				Object.assign(o, {
					width: num(50, 500),
					height: num(30, 300),
					pointerLength: num(0, 80),
					pointerBaseWidth: num(0, 100),
				});
			}
			if (rng() < 0.5) o.pointerPosition = pick([0, 1, num(0, 1)]);
			if (rng() < 0.8) o.pointerDirection = pick(["up", "down", "left", "right"]);
			return rounding(o, [5, num(0, 60)], [0, 0.5, 1, num(-1, 2)]);
		},
		makeSpark: () => {
			const o = { width: num(1, 300), height: num(1, 300) };
			if (rng() < 0.5) o.edgeRoundness = num(-0.5, 2);
			if (rng() < 0.4) o.cornerRadius = pick([0, 5, num(0, 60), -5]);
			return o;
		},
	};
};

const MAKERS = {
	makeRect,
	makeCircle,
	makeEllipse,
	makePie,
	makeTriangle,
	makePolygon,
	makeStar,
	makeHeart,
	makeArrow,
	makeCallout,
	makeSpark,
};

const COMPONENTS = {
	Rect,
	Circle,
	Ellipse,
	Pie,
	Triangle,
	Polygon,
	Star,
	Heart,
	Arrow,
	Callout,
	Spark,
};

export const recordShapes = () => {
	const generators = makeGenerators(makeRng(601));
	const cases = [];
	for (const [name, generate] of Object.entries(generators)) {
		for (let i = 0; i < 150; i++) {
			const options = generate();
			cases.push({ fn: name, options, result: capture(() => MAKERS[name](options)) });
		}
	}
	writeFixture(
		"shapes",
		PACKAGE,
		"make",
		"Every makeX() function on generated options (sizes, directions, corner radius, edge roundness, invalid values)",
		cases,
	);

	const shared = {
		fill: "red",
		stroke: "blue",
		strokeWidth: 3,
		style: { opacity: 0.5 },
		pathStyle: { rotate: "10deg" },
		className: "c",
	};
	const components = [
		["Rect", { width: 100, height: 50 }],
		["Rect", { width: 100, height: 50, edgeRoundness: 0.6, debug: true, ...shared }],
		["Circle", { radius: 20, strokeDasharray: "5 5", strokeDashoffset: "2" }],
		["Ellipse", { rx: 40, ry: 10, ...shared }],
		["Pie", { radius: 20, progress: 0.3, rotation: 1 }],
		["Triangle", { length: 20, direction: "up", cornerRadius: 2, debug: true }],
		["Triangle", { length: 30, direction: "left", ...shared }],
		["Polygon", { points: 6, radius: 25, edgeRoundness: 0.4, debug: true }],
		["Star", { points: 5, innerRadius: 10, outerRadius: 25, cornerRadius: 2, debug: true }],
		["Heart", { height: 40, debug: true, ...shared }],
		["Arrow", { direction: "down", cornerRadius: 6, debug: true }],
		["Callout", { pointerDirection: "left", cornerRadius: 10, ...shared }],
		["Spark", { width: 30, height: 40, cornerRadius: 3, debug: true }],
	];
	writeFixture(
		"shapes",
		PACKAGE,
		"components",
		"Static markup (react-dom/server renderToStaticMarkup) of every shape component",
		components.map(([name, props]) => ({
			component: name,
			props,
			markup: capture(() => renderToStaticMarkup(React.createElement(COMPONENTS[name], props))),
		})),
	);
};
