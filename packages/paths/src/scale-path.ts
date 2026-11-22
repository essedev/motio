import { getBoundingBoxFromInstructions } from "./get-bounding-box.js";
import type { ReducedInstruction } from "./instruction.js";
import { parsePath } from "./parse-path.js";
import { reduceInstructions } from "./reduce-instructions.js";
import { serializeInstructions } from "./serialize-instructions.js";

/**
 * Scales an SVG path from the top-left corner of its bounding box, compatible
 * with Remotion's `scalePath()`. The result is made of `M`, `L`, `C` and `Z`
 * instructions. Throws on malformed path data.
 *
 * @example scalePath("M 0 0 L 100 100", 1, 2) // "M 0 0 L 100 200"
 */
export const scalePath = (path: string, xScale: number, yScale: number): string => {
	const instructions = parsePath(path);
	const box = getBoundingBoxFromInstructions(instructions);
	const sx = (x: number) => (x - box.x1) * xScale + box.x1;
	const sy = (y: number) => (y - box.y1) * yScale + box.y1;
	const scaled = reduceInstructions(instructions).map((i): ReducedInstruction => {
		switch (i.type) {
			case "M":
			case "L":
				return { type: i.type, x: sx(i.x), y: sy(i.y) };
			case "C":
				return {
					type: "C",
					cp1x: sx(i.cp1x),
					cp1y: sy(i.cp1y),
					cp2x: sx(i.cp2x),
					cp2y: sy(i.cp2y),
					x: sx(i.x),
					y: sy(i.y),
				};
			default:
				return i;
		}
	});
	return serializeInstructions(scaled);
};
