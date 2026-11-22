import { arcToCubic } from "./arc-to-cubic.js";
import type { Instruction, ReducedInstruction } from "./instruction.js";
import { normalizeInstructions } from "./normalize-path.js";

/**
 * Reduces instructions to `M`, `L`, `C` and `Z` only, compatible with
 * Remotion's `reduceInstructions()`: relative commands become absolute,
 * `H`/`V` become `L`, `S`/`Q`/`T` become `C`, arcs become one cubic per
 * quarter turn at most.
 *
 * @example reduceInstructions([{type: "m", dx: 10, dy: 10}, {type: "h", dx: 100}])
 */
export const reduceInstructions = (instruction: Instruction[]): ReducedInstruction[] =>
	reduceWithSources(instruction).out;

/**
 * Like `reduceInstructions()`, and also returns for every reduced instruction
 * the index of the input instruction it comes from.
 */
export const reduceWithSources = (
	instruction: Instruction[],
): { out: ReducedInstruction[]; source: number[] } => {
	const out: ReducedInstruction[] = [];
	const source: number[] = [];
	let x = 0;
	let y = 0;
	let startX = 0;
	let startY = 0;
	// Control point to reflect for S (after C/S) and T (after Q/T).
	let lastCubicX = 0;
	let lastCubicY = 0;
	let lastQuadX = 0;
	let lastQuadY = 0;
	let previous: Instruction["type"] | null = null;
	normalizeInstructions(instruction).forEach((i, index) => {
		const before = out.length;
		switch (i.type) {
			case "M":
				out.push(i);
				x = startX = i.x;
				y = startY = i.y;
				break;
			case "L":
				out.push(i);
				x = i.x;
				y = i.y;
				break;
			case "H":
				out.push({ type: "L", x: i.x, y });
				x = i.x;
				break;
			case "V":
				out.push({ type: "L", x, y: i.y });
				y = i.y;
				break;
			case "C":
				out.push(i);
				lastCubicX = i.cp2x;
				lastCubicY = i.cp2y;
				x = i.x;
				y = i.y;
				break;
			case "S": {
				const reflect = previous === "C" || previous === "S";
				const cp1x = reflect ? x + (x - lastCubicX) : x;
				const cp1y = reflect ? y + (y - lastCubicY) : y;
				out.push({ type: "C", cp1x, cp1y, cp2x: i.cpx, cp2y: i.cpy, x: i.x, y: i.y });
				lastCubicX = i.cpx;
				lastCubicY = i.cpy;
				x = i.x;
				y = i.y;
				break;
			}
			case "Q":
			case "T": {
				const reflect = i.type === "T" && (previous === "Q" || previous === "T");
				const qx = i.type === "Q" ? i.cpx : reflect ? x + (x - lastQuadX) : x;
				const qy = i.type === "Q" ? i.cpy : reflect ? y + (y - lastQuadY) : y;
				out.push({
					type: "C",
					cp1x: x + (2 / 3) * (qx - x),
					cp1y: y + (2 / 3) * (qy - y),
					cp2x: i.x + (2 / 3) * (qx - i.x),
					cp2y: i.y + (2 / 3) * (qy - i.y),
					x: i.x,
					y: i.y,
				});
				lastQuadX = qx;
				lastQuadY = qy;
				x = i.x;
				y = i.y;
				break;
			}
			case "A": {
				const curves = arcToCubic({
					x1: x,
					y1: y,
					x2: i.x,
					y2: i.y,
					largeArc: i.largeArcFlag,
					sweep: i.sweepFlag,
					rx: i.rx,
					ry: i.ry,
					xAxisRotation: i.xAxisRotation,
				});
				// A zero radius degenerates to a straight line, as in the SVG spec.
				if (curves.length === 0) out.push({ type: "L", x: i.x, y: i.y });
				for (const [cp1x, cp1y, cp2x, cp2y, cx, cy] of curves) {
					out.push({ type: "C", cp1x, cp1y, cp2x, cp2y, x: cx, y: cy });
				}
				x = i.x;
				y = i.y;
				break;
			}
			case "Z":
				out.push(i);
				x = startX;
				y = startY;
				break;
		}
		previous = i.type;
		for (let k = before; k < out.length; k++) source.push(index);
	});
	return { out, source };
};
