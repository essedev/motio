import type { Instruction } from "@motiojs/paths";

/** Return value of every `makeX()` function, compatible with Remotion's `ShapeInfo`. */
export type ShapeInfo = {
	/** SVG path data for the `d` attribute of a `<path>`. */
	path: string;
	/** The path as instructions. */
	instructions: Instruction[];
	/** Width of the shape, for the `viewBox` of an `<svg>`. */
	width: number;
	/** Height of the shape, for the `viewBox` of an `<svg>`. */
	height: number;
	/** Point to rotate the shape around itself, as "x y" for `transform-origin`. */
	transformOrigin: string;
};

/** Throws when both rounding options are given, as Remotion does. */
export const assertSingleRounding = (
	cornerRadius: number,
	edgeRoundness: number | null | undefined,
): void => {
	if (cornerRadius !== 0 && edgeRoundness !== null && edgeRoundness !== undefined) {
		throw new Error(
			"cornerRadius and edgeRoundness both round the corners: pass one of them, not both.",
		);
	}
};
