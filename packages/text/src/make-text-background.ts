import {
	type Instruction,
	type ReducedInstruction,
	reduceInstructions,
	serializeInstructions,
} from "@motiojs/paths";
import {
	type OutlineJunction,
	type OutlineRow,
	type TextBackgroundJoin,
	traceOutline,
} from "./outline.js";

/** How the lines sit in the block, as in CSS `text-align`. */
export type TextBackgroundAlign = "left" | "center" | "right";

/** Size of one line of text: the width of its glyphs and the height of its line box. */
export interface TextLineSize {
	width: number;
	height: number;
}

/** Options of `makeTextBackground()`. */
export interface MakeTextBackgroundOptions {
	/** One entry per line, top to bottom: `measureText()` of `@motiojs/layout-utils` gives them. */
	lines: readonly TextLineSize[];
	/** Default `"left"`. */
	align?: TextBackgroundAlign;
	/**
	 * Size of every corner, convex and concave. A corner never takes more than half the height of
	 * its line box, half the step to the neighbouring line on its side, or (on the first and last
	 * line) half the line's width. Default 0.
	 */
	cornerRadius?: number;
	/** Space left and right of every line. Default 0. */
	paddingX?: number;
	/** Space above the first line and below the last. Default 0. */
	paddingY?: number;
	/** `"round"` (default) arcs, `"bevel"` straight cuts, `"sharp"` square corners. */
	join?: TextBackgroundJoin;
}

/** Where a line's text sits inside the shape. */
export interface TextBackgroundLineBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** What `makeTextBackground()` returns. */
export interface TextBackgroundShape {
	/** The SVG path, from (0, 0) to (`width`, `height`). */
	path: string;
	/** The path as `M`, `L`, `C` and `Z` instructions. */
	instructions: ReducedInstruction[];
	/** The widest line plus twice `paddingX`. */
	width: number;
	/** The lines' total height plus twice `paddingY`. */
	height: number;
	/** Where each line's text goes so the shape surrounds it. */
	lines: TextBackgroundLineBox[];
}

const ALIGNS: readonly string[] = ["left", "center", "right"];
const JOINS: readonly string[] = ["round", "bevel", "sharp"];

function nonNegative(name: string, value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw new TypeError(
			`makeTextBackground(): ${name} is ${String(value)}: pass a finite number of 0 or more.`,
		);
	}
	return value;
}

/**
 * The shape behind a block of text: one box per line (the line's width plus `paddingX` on each
 * side; the first line gets `paddingY` above, the last below), merged into a single outline whose
 * corners are drawn with `join`: where a line is shorter than its neighbour the outline turns
 * inward with a concave corner, which CSS backgrounds cannot draw. Pure, so it works outside React
 * and in Node; `<TextBackground>` measures its own lines and calls it.
 *
 * Throws a `TypeError` for a negative or non-finite size and an unknown `align` or `join`.
 *
 * @example makeTextBackground({ lines: [{ width: 300, height: 60 }, { width: 180, height: 60 }], align: "center", cornerRadius: 16, paddingX: 20 })
 */
export function makeTextBackground(options: MakeTextBackgroundOptions): TextBackgroundShape {
	const { outline, ...rest } = textBackgroundOutline(options);
	const instructions = reduceInstructions(outline);
	return { path: serializeInstructions(instructions), instructions, ...rest };
}

/**
 * The work of `makeTextBackground()` before arcs become cubics: its outline with `A` instructions.
 * Not part of the public API; the tests compare it with the preset's.
 */
export function textBackgroundOutline(
	options: MakeTextBackgroundOptions,
): Omit<TextBackgroundShape, "path" | "instructions"> & { outline: Instruction[] } {
	const { lines, align = "left", join = "round" } = options;
	if (!Array.isArray(lines)) {
		throw new TypeError(`makeTextBackground(): lines is ${String(lines)}: pass an array.`);
	}
	if (!ALIGNS.includes(align)) {
		throw new TypeError(
			`makeTextBackground(): align is ${JSON.stringify(align)}: use "left", "center" or "right".`,
		);
	}
	if (!JOINS.includes(join)) {
		throw new TypeError(
			`makeTextBackground(): join is ${JSON.stringify(join)}: use "round", "bevel" or "sharp".`,
		);
	}
	const radius = nonNegative("cornerRadius", options.cornerRadius ?? 0);
	const paddingX = nonNegative("paddingX", options.paddingX ?? 0);
	const paddingY = nonNegative("paddingY", options.paddingY ?? 0);
	const sizes = lines.map((line, i) => ({
		width: nonNegative(`lines[${i}].width`, line?.width),
		height: nonNegative(`lines[${i}].height`, line?.height),
	}));
	if (sizes.length === 0) return { outline: [], width: 0, height: 0, lines: [] };

	const widest = Math.max(...sizes.map((s) => s.width)) + 2 * paddingX;
	const last = sizes.length - 1;
	const rows: OutlineRow[] = sizes.map((size, i) => {
		const box = size.width + 2 * paddingX;
		const left = align === "center" ? (widest - box) / 2 : align === "right" ? widest - box : 0;
		const height = size.height + (i === 0 ? paddingY : 0) + (i === last ? paddingY : 0);
		return { left, right: left + box, height };
	});
	const junction = (i: number, side: "left" | "right"): OutlineJunction => {
		const upper = rows[i] as OutlineRow;
		const lower = rows[i + 1] as OutlineRow;
		const half = Math.abs(upper[side] - lower[side]) / 2;
		return {
			upper: Math.min(radius, upper.height / 2, half),
			lower: Math.min(radius, lower.height / 2, half),
			inward: side === "right" ? lower.right < upper.right : lower.left > upper.left,
		};
	};
	const junctions = (side: "left" | "right") => rows.slice(1).map((_row, i) => junction(i, side));
	const cap = (row: OutlineRow) => Math.min(radius, row.height / 2, (row.right - row.left) / 2);
	const outline = traceOutline(
		rows,
		{
			top: cap(rows[0] as OutlineRow),
			bottom: cap(rows[last] as OutlineRow),
			right: junctions("right"),
			left: junctions("left"),
		},
		join,
		{ dropDegenerate: true },
	);

	let y = paddingY;
	const boxes = sizes.map((size, i) => {
		const box = { x: (rows[i] as OutlineRow).left + paddingX, y, ...size };
		y += size.height;
		return box;
	});
	return {
		outline,
		width: widest,
		height: y + paddingY,
		lines: boxes,
	};
}
