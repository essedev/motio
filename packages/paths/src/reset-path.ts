import { getBoundingBoxFromInstructions } from "./get-bounding-box.js";
import type { Point } from "./instruction.js";
import { parsePath } from "./parse-path.js";
import { serializeInstructions } from "./serialize-instructions.js";
import { translateInstructions } from "./translate-path.js";

/**
 * Translates an SVG path so that the top-left corner of its bounding box is at
 * (0, 0), compatible with Remotion's `resetPath()`. Throws on malformed path data.
 *
 * @example resetPath("M 10 10 L 20 20") // "M 0 0 L 10 10"
 */
export const resetPath = (d: string): string => {
	const instructions = parsePath(d);
	const box = getBoundingBoxFromInstructions(instructions);
	return serializeInstructions(translateInstructions(instructions, -box.x1, -box.y1));
};

/**
 * Translates an SVG path so that the centre of its bounding box is at `target`
 * (default (0, 0)), compatible with Remotion's `centerPath()`. Throws on
 * malformed path data.
 *
 * @example centerPath("M 10 10 L 20 20") // "M -5 -5 L 5 5"
 */
export const centerPath = (path: string, target: Point = { x: 0, y: 0 }): string => {
	const instructions = parsePath(path);
	const box = getBoundingBoxFromInstructions(instructions);
	const cx = (box.x1 + box.x2) / 2;
	const cy = (box.y1 + box.y2) / 2;
	return serializeInstructions(translateInstructions(instructions, target.x - cx, target.y - cy));
};
