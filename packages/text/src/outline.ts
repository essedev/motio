import type { Instruction } from "@motiojs/paths";

/** How the corners of a text background are drawn. */
export type TextBackgroundJoin = "round" | "bevel" | "sharp";

/** One row of the outline: the horizontal extent of a line's box and its height. */
export interface OutlineRow {
	left: number;
	right: number;
	height: number;
}

/**
 * The corner where two rows meet on one side. `upper` and `lower` are the sizes of the corner on
 * the upper row and on the lower row; `inward` is true when the lower row's edge on this side is
 * closer to the middle than the upper row's (the lower row is narrower on that side).
 */
export interface OutlineJunction {
	upper: number;
	lower: number;
	inward: boolean;
}

/** Corner sizes of an outline: zero draws a square corner. */
export interface OutlineCorners {
	/** The two top corners of the first row. */
	top: number;
	/** The two bottom corners of the last row. */
	bottom: number;
	/** Junction `i` joins row `i` and row `i + 1`. */
	right: readonly OutlineJunction[];
	left: readonly OutlineJunction[];
}

type Point = { x: number; y: number };

/**
 * Traces the outline of stacked rows as one closed path, clockwise from the top-left corner of
 * the first row: its top edge, the right side down through every junction, the bottom edge of the
 * last row, the left side up. A corner of size `r` starts `r` before the corner point and ends `r`
 * after it; `round` draws a quarter circle (concave where the outline turns inward), `bevel` a
 * straight cut, and `sharp` (or a size of zero) no corner at all.
 *
 * Every corner emits a line to its start, even when the line has no length: the published
 * @remotion/rounded-text-box does, and its preset must equal it. Callers that stroke the path pass
 * `dropDegenerate` so zero-length lines do not break miter joins.
 *
 * Going down, y is the sum of the heights above; going up, the total minus the heights below
 * (the two differ by rounding, as in the published package).
 */
export function traceOutline(
	rows: readonly OutlineRow[],
	corners: OutlineCorners,
	join: TextBackgroundJoin,
	options: { dropDegenerate?: boolean } = {},
): Instruction[] {
	if (join === "sharp") {
		const square = (j: OutlineJunction): OutlineJunction => ({
			upper: 0,
			lower: 0,
			inward: j.inward,
		});
		return traceOutline(
			rows,
			{ top: 0, bottom: 0, right: corners.right.map(square), left: corners.left.map(square) },
			"round",
			options,
		);
	}
	const out: Instruction[] = [];
	if (rows.length === 0) return [{ type: "Z" }];
	let at: Point = { x: 0, y: 0 };
	const lineTo = (x: number, y: number) => {
		if (options.dropDegenerate && x === at.x && y === at.y) return;
		out.push({ type: "L", x, y });
		at = { x, y };
	};
	const corner = (size: number, convex: boolean, x: number, y: number) => {
		// False for NaN and negative sizes too: no corner.
		if (!(size > 0)) return;
		if (join === "bevel") {
			lineTo(x, y);
			return;
		}
		out.push({
			type: "A",
			rx: size,
			ry: size,
			xAxisRotation: 0,
			largeArcFlag: false,
			sweepFlag: convex,
			x,
			y,
		});
		at = { x, y };
	};

	const first = rows[0] as OutlineRow;
	const last = rows[rows.length - 1] as OutlineRow;
	const top = corners.top;
	out.push({ type: "M", x: first.left + top, y: 0 });
	at = { x: first.left + top, y: 0 };
	lineTo(first.right - top, 0);
	corner(top, true, first.right, top);

	let y = 0;
	for (let i = 0; i < rows.length - 1; i++) {
		const upper = rows[i] as OutlineRow;
		const lower = rows[i + 1] as OutlineRow;
		const j = corners.right[i] as OutlineJunction;
		y += upper.height;
		lineTo(upper.right, y - j.upper);
		if (j.inward) {
			corner(j.upper, true, upper.right - j.upper, y);
			lineTo(lower.right + j.lower, y);
			corner(j.lower, false, lower.right, y + j.lower);
		} else {
			corner(j.upper, false, upper.right + j.upper, y);
			lineTo(lower.right - j.lower, y);
			corner(j.lower, true, lower.right, y + j.lower);
		}
	}
	y += last.height;

	const bottom = corners.bottom;
	lineTo(last.right, y - bottom);
	corner(bottom, true, last.right - bottom, y);
	lineTo(last.left + bottom, y);
	corner(bottom, true, last.left, y - bottom);

	for (let i = rows.length - 1; i > 0; i--) {
		const lower = rows[i] as OutlineRow;
		const upper = rows[i - 1] as OutlineRow;
		const j = corners.left[i - 1] as OutlineJunction;
		y -= lower.height;
		lineTo(lower.left, y + j.lower);
		if (j.inward) {
			corner(j.lower, false, lower.left - j.lower, y);
			lineTo(upper.left + j.upper, y);
			corner(j.upper, true, upper.left, y - j.upper);
		} else {
			corner(j.lower, true, lower.left + j.lower, y);
			lineTo(upper.left - j.upper, y);
			corner(j.upper, false, upper.left, y - j.upper);
		}
	}
	y -= first.height;
	lineTo(first.left, y + top);
	corner(top, true, first.left + top, y);
	out.push({ type: "Z" });
	return out;
}
