import type { Instruction } from "./instruction.js";
import { parsePath } from "./parse-path.js";
import { serializeInstructions } from "./serialize-instructions.js";

/**
 * Translates instructions. Relative instructions keep their offsets, except a
 * leading `m`, whose offset is from the origin and therefore absolute.
 */
export const translateInstructions = (path: Instruction[], x: number, y: number): Instruction[] =>
	path.map((i, index): Instruction => {
		switch (i.type) {
			case "M":
			case "L":
			case "T":
				return { ...i, x: i.x + x, y: i.y + y };
			case "H":
				return { ...i, x: i.x + x };
			case "V":
				return { ...i, y: i.y + y };
			case "C":
				return {
					...i,
					cp1x: i.cp1x + x,
					cp1y: i.cp1y + y,
					cp2x: i.cp2x + x,
					cp2y: i.cp2y + y,
					x: i.x + x,
					y: i.y + y,
				};
			case "S":
			case "Q":
				return { ...i, cpx: i.cpx + x, cpy: i.cpy + y, x: i.x + x, y: i.y + y };
			case "A":
				return { ...i, x: i.x + x, y: i.y + y };
			case "m":
				return index === 0 ? { ...i, dx: i.dx + x, dy: i.dy + y } : { ...i };
			default:
				return { ...i };
		}
	});

/**
 * Translates an SVG path by `x` and `y`, compatible with Remotion's
 * `translatePath()`. Relative instructions stay relative. Throws on malformed
 * path data.
 *
 * @example translatePath("M 50 50 L 150 50", 10, 0) // "M 60 50 L 160 50"
 */
export const translatePath = (path: string, x: number, y: number): string =>
	serializeInstructions(translateInstructions(parsePath(path), x, y));
