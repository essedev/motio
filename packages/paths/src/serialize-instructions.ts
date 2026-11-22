import type { Instruction } from "./instruction.js";

const flag = (value: boolean): number => (value ? 1 : 0);

const values = (i: Instruction): (number | string)[] => {
	switch (i.type) {
		case "M":
		case "L":
		case "T":
			return [i.type, i.x, i.y];
		case "m":
		case "l":
		case "t":
			return [i.type, i.dx, i.dy];
		case "H":
			return [i.type, i.x];
		case "h":
			return [i.type, i.dx];
		case "V":
			return [i.type, i.y];
		case "v":
			return [i.type, i.dy];
		case "C":
			return [i.type, i.cp1x, i.cp1y, i.cp2x, i.cp2y, i.x, i.y];
		case "c":
			return [i.type, i.cp1dx, i.cp1dy, i.cp2dx, i.cp2dy, i.dx, i.dy];
		case "S":
		case "Q":
			return [i.type, i.cpx, i.cpy, i.x, i.y];
		case "s":
		case "q":
			return [i.type, i.cpdx, i.cpdy, i.dx, i.dy];
		case "A":
			return [
				i.type,
				i.rx,
				i.ry,
				i.xAxisRotation,
				flag(i.largeArcFlag),
				flag(i.sweepFlag),
				i.x,
				i.y,
			];
		case "a":
			return [
				i.type,
				i.rx,
				i.ry,
				i.xAxisRotation,
				flag(i.largeArcFlag),
				flag(i.sweepFlag),
				i.dx,
				i.dy,
			];
		case "Z":
			return ["Z"];
		default:
			throw new Error(`Unknown instruction type: ${(i as { type: string }).type}`);
	}
};

/**
 * Serializes instructions into an SVG path string, compatible with Remotion's
 * `serializeInstructions()`: values separated by single spaces, flags as 0 or 1.
 *
 * @example serializeInstructions([{type: "M", x: 10, y: 10}, {type: "L", x: 20, y: 20}]) // "M 10 10 L 20 20"
 */
export const serializeInstructions = (path: Instruction[]): string =>
	path.map((instruction) => values(instruction).join(" ")).join(" ");
