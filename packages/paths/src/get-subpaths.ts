import type { Instruction } from "./instruction.js";
import { parsePath } from "./parse-path.js";
import { assertNoLeadingSmoothCurve } from "./properties/path-properties.js";
import { serializeInstructions } from "./serialize-instructions.js";

/**
 * Splits an SVG path into its subpaths, compatible with Remotion's
 * `getSubpaths()`. Each `M` or `m` starts a subpath; a relative `m` becomes an
 * absolute `M`, the other instructions are kept as they are, and instructions
 * before the first move are dropped. Throws on malformed path data.
 *
 * @example getSubpaths("M 0 0 L 100 0 M 0 100 L 200 100") // ["M 0 0 L 100 0", "M 0 100 L 200 100"]
 */
export const getSubpaths = (path: string): string[] => {
	const parts: Instruction[][] = [];
	let x = 0;
	let y = 0;
	let startX = 0;
	let startY = 0;
	const instructions = parsePath(path);
	assertNoLeadingSmoothCurve(instructions);
	for (const i of instructions) {
		if (i.type === "M" || i.type === "m") {
			x = i.type === "M" ? i.x : x + i.dx;
			y = i.type === "M" ? i.y : y + i.dy;
			startX = x;
			startY = y;
			parts.push([{ type: "M", x, y }]);
			continue;
		}
		// Instructions before the first move belong to no subpath.
		parts[parts.length - 1]?.push(i);
		switch (i.type) {
			case "Z":
				x = startX;
				y = startY;
				break;
			case "H":
				x = i.x;
				break;
			case "h":
				x += i.dx;
				break;
			case "V":
				y = i.y;
				break;
			case "v":
				y += i.dy;
				break;
			case "l":
			case "t":
			case "c":
			case "s":
			case "q":
			case "a":
				x += i.dx;
				y += i.dy;
				break;
			default:
				x = i.x;
				y = i.y;
		}
	}
	return parts.map(serializeInstructions);
};
