import { type Instruction, serializeInstructions } from "@motiojs/paths";
import { joinPoints } from "./join-points.js";
import type { ShapeDirection } from "./make-triangle.js";
import { assertSingleRounding, type ShapeInfo } from "./shape-info.js";

/** Options of `makeCallout()`. */
export type MakeCalloutProps = {
	/** Width of the body. Default 500. */
	width?: number;
	/** Height of the body. Default 200. */
	height?: number;
	/** Length of the pointer. Default 40. */
	pointerLength?: number;
	/** Width of the pointer where it meets the body. Default 60. */
	pointerBaseWidth?: number;
	/** Position of the pointer along its side, 0 to 1. Default 0.5. */
	pointerPosition?: number;
	/** Side and direction of the pointer. Default "down". */
	pointerDirection?: ShapeDirection;
	/** Rounds the edges with Bézier curves. Default null. */
	edgeRoundness?: number | null;
	/** Rounds the body corners with arcs. Default 0. */
	cornerRadius?: number;
};

type Pt = [number, number];
const same = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1];
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Generates a speech-bubble callout, compatible with Remotion's
 * `makeCallout()`. The transform origin is the centre of the body, without
 * the pointer.
 *
 * @example makeCallout({}).height // 240
 */
export const makeCallout = ({
	width = 500,
	height = 200,
	pointerLength = 40,
	pointerBaseWidth = 60,
	pointerPosition = 0.5,
	pointerDirection = "down",
	edgeRoundness = null,
	cornerRadius = 0,
}: MakeCalloutProps): ShapeInfo => {
	for (const [name, value] of [
		["width", width],
		["height", height],
		["pointerLength", pointerLength],
		["pointerBaseWidth", pointerBaseWidth],
	] as const) {
		if (value <= 0) throw new Error(`"${name}" must be a positive number, got ${value}`);
	}
	if (pointerPosition < 0 || pointerPosition > 1) {
		throw new Error(`"pointerPosition" must be a number between 0 and 1, got ${pointerPosition}`);
	}
	assertSingleRounding(cornerRadius, edgeRoundness);
	if (!["up", "down", "left", "right"].includes(pointerDirection)) {
		// Remotion fails this way on an unknown direction.
		throw new TypeError("Cannot read properties of undefined (reading 'reduce')");
	}
	const bx = pointerDirection === "left" ? pointerLength : 0;
	const by = pointerDirection === "up" ? pointerLength : 0;
	const half = pointerBaseWidth / 2;
	const tl: Pt = [bx, by];
	const tr: Pt = [bx + width, by];
	const br: Pt = [bx + width, by + height];
	const bl: Pt = [bx, by + height];
	const px = bx + width * pointerPosition;
	const py = by + height * pointerPosition;
	const xs = (x: number) => clamp(x, bx, bx + width);
	const ys = (y: number) => clamp(y, by, by + height);
	const pointer: Record<ShapeDirection, Pt[]> = {
		up: [
			[xs(px - half), by],
			[px, by - pointerLength],
			[xs(px + half), by],
		],
		right: [
			[bx + width, ys(py - half)],
			[bx + width + pointerLength, py],
			[bx + width, ys(py + half)],
		],
		down: [
			[xs(px + half), by + height],
			[px, by + height + pointerLength],
			[xs(px - half), by + height],
		],
		left: [
			[bx, ys(py + half)],
			[bx - pointerLength, py],
			[bx, ys(py - half)],
		],
	};
	const sides: ShapeDirection[] = ["up", "right", "down", "left"];
	const corners = [tr, br, bl, tl];
	// Outline from the top-left corner, clockwise, with the pointer on its
	// side; repeated points are dropped. A corner that a pointer point
	// touches is not rounded.
	type Vertex = { point: Pt; corner: number | null };
	const outline: Vertex[] = [{ point: tl, corner: 3 }];
	sides.forEach((side, i) => {
		if (side === pointerDirection) {
			for (const point of pointer[side]) outline.push({ point, corner: null });
		}
		outline.push({ point: corners[i] as Pt, corner: i });
	});
	const deduped: Vertex[] = [];
	for (const vertex of outline) {
		const last = deduped[deduped.length - 1];
		if (last !== undefined && same(last.point, vertex.point)) {
			if (vertex.corner === null || last.corner === null) last.corner = null;
			continue;
		}
		deduped.push({ ...vertex });
	}
	const touched = new Set(
		deduped.filter((v) => v.corner === null).map((v) => `${v.point[0]} ${v.point[1]}`),
	);
	const isRounded = (corner: number) =>
		cornerRadius !== 0 &&
		!touched.has(`${(corners[corner] as Pt)[0]} ${(corners[corner] as Pt)[1]}`);

	let instructions: Instruction[];
	if (cornerRadius === 0) {
		instructions = joinPoints(
			deduped.map((v) => v.point),
			{ edgeRoundness, cornerRadius: 0, close: true },
		);
	} else {
		const r = cornerRadius;
		const pre: Pt[] = [
			[bx + width - r, by],
			[bx + width, by + height - r],
			[bx + r, by + height],
			[bx, by + r],
		];
		const arcs: [number, number][] = [
			[r, r],
			[-r, r],
			[-r, -r],
			[r, -r],
		];
		const arc = ([dx, dy]: [number, number]): Instruction => ({
			type: "a",
			rx: r,
			ry: r,
			xAxisRotation: 0,
			dx,
			dy,
			largeArcFlag: false,
			sweepFlag: true,
		});
		const start: Pt = isRounded(3) ? [bx + r, by] : tl;
		instructions = [{ type: "M", x: start[0], y: start[1] }];
		for (const vertex of deduped.slice(1)) {
			if (vertex.corner !== null && isRounded(vertex.corner)) {
				const p = pre[vertex.corner] as Pt;
				instructions.push({ type: "L", x: p[0], y: p[1] });
				instructions.push(arc(arcs[vertex.corner] as [number, number]));
			} else if (vertex !== deduped[deduped.length - 1] || !same(vertex.point, start)) {
				instructions.push({ type: "L", x: vertex.point[0], y: vertex.point[1] });
			}
		}
		instructions.push({ type: "Z" });
	}
	const totalWidth =
		width + (pointerDirection === "left" || pointerDirection === "right" ? pointerLength : 0);
	const totalHeight =
		height + (pointerDirection === "up" || pointerDirection === "down" ? pointerLength : 0);
	return {
		width: totalWidth,
		height: totalHeight,
		path: serializeInstructions(instructions),
		instructions,
		transformOrigin: `${bx + width / 2} ${by + height / 2}`,
	};
};
