import { getBoundingBox, type Instruction, serializeInstructions } from "@motiojs/paths";
import { joinPoints } from "./join-points.js";
import type { ShapeInfo } from "./shape-info.js";

const translate = (instructions: Instruction[], x: number, y: number): Instruction[] =>
	instructions.map((i): Instruction => {
		if (i.type === "M" || i.type === "L") return { ...i, x: i.x + x, y: i.y + y };
		if (i.type === "C") {
			return {
				...i,
				cp1x: i.cp1x + x,
				cp1y: i.cp1y + y,
				cp2x: i.cp2x + x,
				cp2y: i.cp2y + y,
				x: i.x + x,
				y: i.y + y,
			};
		}
		return i;
	});

/**
 * Shape info for a closed polygon given around (0, 0): the path is joined
 * (rounded if asked), then moved so its bounding box starts at (0, 0); the
 * transform origin is where (0, 0) ends up.
 */
export const polygonShape = (
	points: [number, number][],
	options: { edgeRoundness: number | null; cornerRadius: number; close: boolean },
): ShapeInfo => {
	const joined = joinPoints([...points, points[0] as [number, number]], options);
	const box = getBoundingBox(serializeInstructions(joined));
	const instructions = translate(joined, -box.x1, -box.y1);
	return {
		path: serializeInstructions(instructions),
		instructions,
		width: box.width,
		height: box.height,
		transformOrigin: `${-box.x1} ${-box.y1}`,
	};
};
