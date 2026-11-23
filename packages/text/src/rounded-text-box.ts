/**
 * `@motiojs/text/rounded-text-box`, the equivalent of `@remotion/rounded-text-box`: the published
 * `createRoundedTextBox()` as a preset of Motio's text background (round corners, no vertical
 * padding), with the published package's own layout rules so its output is the same path.
 */
import {
	type BoundingBox,
	getBoundingBox,
	type Instruction,
	type ReducedInstruction,
	reduceInstructions,
	serializeInstructions,
} from "@motiojs/paths";
import { type OutlineJunction, type OutlineRow, traceOutline } from "./outline.js";

/** Alignment of the lines, as in CSS `text-align`. */
export type TextAlign = "left" | "center" | "right";

/** Width and height of one line, as `measureText()` of `@motiojs/layout-utils` returns them. */
export interface Dimensions {
	width: number;
	height: number;
}

/** Options of `createRoundedTextBox()`. */
export interface CreateRoundedTextBoxProps {
	/** One entry per line, top to bottom. */
	textMeasurements: Dimensions[];
	textAlign: TextAlign;
	/** Space added left and right of every line. */
	horizontalPadding: number;
	borderRadius: number;
}

/** What `createRoundedTextBox()` returns. */
export interface CreateRoundedTextBoxResult {
	/** The SVG path of the box. */
	d: string;
	/** Bounding box of the path, as `getBoundingBox()` of `@motiojs/paths` computes it. */
	boundingBox: BoundingBox;
	/** The path as `M`, `L`, `C` and `Z` instructions. */
	instructions: ReducedInstruction[];
}

/**
 * The SVG path of a box behind multi-line text, one row per line, merged into one shape with
 * rounded corners: convex where a line sticks out, concave where it is shorter than its
 * neighbour. Lines are stacked from y = 0 in the order given and aligned with `textAlign`; each
 * is `horizontalPadding` wider on both sides than its measurement. A corner's radius is
 * `borderRadius`, at most half the height of its line and half the step to the neighbouring line
 * on that side. Equal to the published function, including its handling of values outside the
 * documented ones (an alignment other than `"center"` or `"right"` lays lines out from the left
 * and rounds both sides; a negative radius draws square corners).
 *
 * For Motio's configurable version (vertical padding, bevelled or square corners, a border, a
 * shadow, a component that measures its own lines) use `makeTextBackground()` and
 * `<TextBackground>` from `@motiojs/text`.
 */
export function createRoundedTextBox(props: CreateRoundedTextBoxProps): CreateRoundedTextBoxResult {
	const instructions = reduceInstructions(roundedTextBoxOutline(props));
	const d = serializeInstructions(instructions);
	return { d, boundingBox: getBoundingBox(d), instructions };
}

/**
 * The outline of `createRoundedTextBox()` before arcs become cubics. Not part of the public API;
 * the tests compare it with `makeTextBackground()`'s.
 */
export function roundedTextBoxOutline({
	textMeasurements,
	textAlign,
	horizontalPadding,
	borderRadius,
}: CreateRoundedTextBoxProps): Instruction[] {
	const lines = [...textMeasurements];
	const radius = Math.max(0, borderRadius);
	const boxWidths = lines.map((line) => line.width + 2 * horizontalPadding);
	const widest = Math.max(0, ...boxWidths);
	const rows: OutlineRow[] = lines.map((line, i) => {
		const box = boxWidths[i] as number;
		const left =
			textAlign === "center" ? (widest - box) / 2 : textAlign === "right" ? widest - box : 0;
		return { left, right: left + line.width + 2 * horizontalPadding, height: line.height };
	});
	// The step between two lines on a side is half the width difference when both sides move
	// (centred) and the whole difference when one side is aligned; the aligned side has no corner.
	const divisor = textAlign === "left" || textAlign === "right" ? 2 : 4;
	const junction = (i: number, aligned: boolean): OutlineJunction => {
		const upper = lines[i] as Dimensions;
		const lower = lines[i + 1] as Dimensions;
		const step = aligned ? 0 : Math.abs(upper.width - lower.width) / divisor;
		return {
			upper: Math.min(radius, upper.height / 2, step),
			lower: Math.min(radius, lower.height / 2, step),
			inward: lower.width + 2 * horizontalPadding < upper.width + 2 * horizontalPadding,
		};
	};
	const junctions = (aligned: boolean) => lines.slice(1).map((_line, i) => junction(i, aligned));
	const first = lines[0];
	const last = lines[lines.length - 1];
	return traceOutline(
		rows,
		{
			top: first ? Math.min(radius, first.height / 2) : 0,
			bottom: last ? Math.min(radius, last.height / 2) : 0,
			right: junctions(textAlign === "right"),
			left: junctions(textAlign === "left"),
		},
		"round",
	);
}
