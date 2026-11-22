/**
 * One SVG path command, compatible with Remotion's `Instruction` type.
 * Upper-case types carry absolute coordinates, lower-case types relative
 * offsets (`dx`, `dy`); `Z` closes the current subpath.
 */
export type Instruction =
	| { type: "M"; x: number; y: number }
	| { type: "L"; x: number; y: number }
	| { type: "H"; x: number }
	| { type: "V"; y: number }
	| { type: "C"; cp1x: number; cp1y: number; cp2x: number; cp2y: number; x: number; y: number }
	| { type: "S"; cpx: number; cpy: number; x: number; y: number }
	| { type: "Q"; cpx: number; cpy: number; x: number; y: number }
	| { type: "T"; x: number; y: number }
	| {
			type: "A";
			rx: number;
			ry: number;
			xAxisRotation: number;
			largeArcFlag: boolean;
			sweepFlag: boolean;
			x: number;
			y: number;
	  }
	| { type: "m"; dx: number; dy: number }
	| { type: "l"; dx: number; dy: number }
	| { type: "h"; dx: number }
	| { type: "v"; dy: number }
	| {
			type: "c";
			cp1dx: number;
			cp1dy: number;
			cp2dx: number;
			cp2dy: number;
			dx: number;
			dy: number;
	  }
	| { type: "s"; cpdx: number; cpdy: number; dx: number; dy: number }
	| { type: "q"; cpdx: number; cpdy: number; dx: number; dy: number }
	| { type: "t"; dx: number; dy: number }
	| {
			type: "a";
			rx: number;
			ry: number;
			xAxisRotation: number;
			largeArcFlag: boolean;
			sweepFlag: boolean;
			dx: number;
			dy: number;
	  }
	| { type: "Z" };

/** An instruction with absolute coordinates only, as `normalizePath()` produces. */
export type AbsoluteInstruction = Extract<
	Instruction,
	{ type: "M" | "L" | "H" | "V" | "C" | "S" | "Q" | "T" | "A" | "Z" }
>;

/**
 * The instructions left after `reduceInstructions()`, compatible with
 * Remotion's `ReducedInstruction` type: `M`, `L`, `C` and `Z` only.
 */
export type ReducedInstruction = Extract<Instruction, { type: "M" | "L" | "C" | "Z" }>;

/** A point in path coordinates. */
export type Point = { x: number; y: number };
