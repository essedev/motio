import type { ReducedInstruction } from "./instruction.js";
import { parsePath } from "./parse-path.js";
import { reduceInstructions } from "./reduce-instructions.js";

type Drawn = { from: [number, number]; i: Extract<ReducedInstruction, { type: "L" | "C" }> };

/**
 * Reverses the direction of an SVG path, compatible with Remotion's
 * `reversePath()`: each subpath is drawn from its end to its start, closed
 * subpaths stay closed; instructions before the first move are dropped. The
 * result is made of `M`, `L`, `C` and `Z` instructions. Throws on malformed
 * path data.
 *
 * @example reversePath("M 0 0 L 100 0") // "M 100 0 L 0 0"
 */
export const reversePath = (path: string): string => {
	const subpaths: { start: [number, number]; drawn: Drawn[]; closed: boolean }[] = [];
	let x = 0;
	let y = 0;
	let current: (typeof subpaths)[number] | null = null;
	for (const i of reduceInstructions(parsePath(path))) {
		if (i.type === "M") {
			current = { start: [i.x, i.y], drawn: [], closed: false };
			subpaths.push(current);
			x = i.x;
			y = i.y;
			continue;
		}
		// Instructions before the first move are dropped.
		if (subpaths.length === 0) continue;
		if (current === null) {
			current = { start: [x, y], drawn: [], closed: false };
			subpaths.push(current);
		}
		if (i.type === "Z") {
			current.closed = true;
			x = current.start[0];
			y = current.start[1];
			// Drawing after Z starts a new subpath at the same point.
			current = null;
			continue;
		}
		current.drawn.push({ from: [x, y], i });
		x = i.x;
		y = i.y;
	}
	return subpaths
		.map(({ start, drawn, closed }) => {
			const last = drawn[drawn.length - 1];
			const [endX, endY] = last === undefined ? start : [last.i.x, last.i.y];
			const parts = [`M ${endX} ${endY}`];
			for (let k = drawn.length - 1; k >= 0; k--) {
				const { from, i } = drawn[k] as Drawn;
				parts.push(
					i.type === "L"
						? `L ${from[0]} ${from[1]}`
						: `C ${i.cp2x} ${i.cp2y} ${i.cp1x} ${i.cp1y} ${from[0]} ${from[1]}`,
				);
			}
			return parts.join(" ") + (closed ? "Z" : "");
		})
		.join(" ");
};
