import type { AbsoluteInstruction, Instruction } from "./instruction.js";
import { parsePath } from "./parse-path.js";
import { serializeInstructions } from "./serialize-instructions.js";

/**
 * Converts relative instructions to absolute ones. `H`, `V`, `S`, `T` and `A`
 * keep their type. After `Z`, the current point returns to the start of the
 * subpath.
 */
export const normalizeInstructions = (instructions: Instruction[]): AbsoluteInstruction[] => {
	const out: AbsoluteInstruction[] = [];
	let x = 0;
	let y = 0;
	let startX = 0;
	let startY = 0;
	for (const i of instructions) {
		switch (i.type) {
			case "M":
				out.push({ type: "M", x: i.x, y: i.y });
				startX = i.x;
				startY = i.y;
				x = i.x;
				y = i.y;
				break;
			case "m":
				x += i.dx;
				y += i.dy;
				out.push({ type: "M", x, y });
				startX = x;
				startY = y;
				break;
			case "L":
				out.push({ type: "L", x: i.x, y: i.y });
				x = i.x;
				y = i.y;
				break;
			case "l":
				x += i.dx;
				y += i.dy;
				out.push({ type: "L", x, y });
				break;
			case "H":
				out.push({ type: "H", x: i.x });
				x = i.x;
				break;
			case "h":
				x += i.dx;
				out.push({ type: "H", x });
				break;
			case "V":
				out.push({ type: "V", y: i.y });
				y = i.y;
				break;
			case "v":
				y += i.dy;
				out.push({ type: "V", y });
				break;
			case "C":
				out.push({ ...i });
				x = i.x;
				y = i.y;
				break;
			case "c":
				out.push({
					type: "C",
					cp1x: x + i.cp1dx,
					cp1y: y + i.cp1dy,
					cp2x: x + i.cp2dx,
					cp2y: y + i.cp2dy,
					x: x + i.dx,
					y: y + i.dy,
				});
				x += i.dx;
				y += i.dy;
				break;
			case "S":
			case "Q":
				out.push({ ...i });
				x = i.x;
				y = i.y;
				break;
			case "s":
			case "q":
				out.push({
					type: i.type === "s" ? "S" : "Q",
					cpx: x + i.cpdx,
					cpy: y + i.cpdy,
					x: x + i.dx,
					y: y + i.dy,
				});
				x += i.dx;
				y += i.dy;
				break;
			case "T":
				out.push({ type: "T", x: i.x, y: i.y });
				x = i.x;
				y = i.y;
				break;
			case "t":
				x += i.dx;
				y += i.dy;
				out.push({ type: "T", x, y });
				break;
			case "A":
				out.push({ ...i });
				x = i.x;
				y = i.y;
				break;
			case "a":
				x += i.dx;
				y += i.dy;
				out.push({
					type: "A",
					rx: i.rx,
					ry: i.ry,
					xAxisRotation: i.xAxisRotation,
					largeArcFlag: i.largeArcFlag,
					sweepFlag: i.sweepFlag,
					x,
					y,
				});
				break;
			case "Z":
				out.push({ type: "Z" });
				x = startX;
				y = startY;
				break;
		}
	}
	return out;
};

/**
 * Replaces relative coordinates with absolute ones, compatible with
 * Remotion's `normalizePath()`. Throws on malformed path data.
 *
 * @example normalizePath("M 50 50 l 100 0") // "M 50 50 L 150 50"
 */
export const normalizePath = (path: string): string =>
	serializeInstructions(normalizeInstructions(parsePath(path)));
