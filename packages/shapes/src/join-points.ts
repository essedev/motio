import type { Instruction } from "@motiojs/paths";

type Pt = [number, number];

const distance = (a: Pt, b: Pt): number => Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);

/** The point at `length` from `from` towards `to`. */
const towards = (from: Pt, to: Pt, length: number): Pt => {
	const d = distance(from, to);
	return [from[0] + ((to[0] - from[0]) / d) * length, from[1] + ((to[1] - from[1]) / d) * length];
};

/**
 * Joins a closed polygon (the last point repeats the first) into instructions:
 * - straight edges by default;
 * - with `edgeRoundness`, cubic curves between edge midpoints whose control
 *   points move from the midpoints towards the corners;
 * - with `cornerRadius`, straight edges whose corners are cut `cornerRadius`
 *   from the corner and joined by a cubic with both control points on it.
 */
export const joinPoints = (
	points: Pt[],
	{
		edgeRoundness,
		cornerRadius,
		close,
	}: { edgeRoundness: number | null; cornerRadius: number; close: boolean },
): Instruction[] => {
	const corners = points.slice(0, -1);
	const n = corners.length;
	const at = (i: number) => corners[((i % n) + n) % n] as Pt;
	const out: Instruction[] = [];
	if (edgeRoundness !== null) {
		const mid = (i: number): Pt => {
			const a = at(i);
			const b = at(i + 1);
			return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
		};
		const start = mid(0);
		out.push({ type: "M", x: start[0], y: start[1] });
		for (let i = 1; i <= n; i++) {
			const corner = at(i);
			const from = mid(i - 1);
			const to = mid(i);
			out.push({
				type: "C",
				cp1x: from[0] + (corner[0] - from[0]) * edgeRoundness,
				cp1y: from[1] + (corner[1] - from[1]) * edgeRoundness,
				cp2x: to[0] + (corner[0] - to[0]) * edgeRoundness,
				cp2y: to[1] + (corner[1] - to[1]) * edgeRoundness,
				x: to[0],
				y: to[1],
			});
		}
	} else if (cornerRadius !== 0) {
		for (let i = 1; i <= n; i++) {
			const corner = at(i);
			const before = towards(corner, at(i - 1), cornerRadius);
			const after = towards(corner, at(i + 1), cornerRadius);
			if (i === 1) out.push({ type: "M", x: before[0], y: before[1] });
			out.push({ type: "L", x: before[0], y: before[1] });
			out.push({
				type: "C",
				cp1x: corner[0],
				cp1y: corner[1],
				cp2x: corner[0],
				cp2y: corner[1],
				x: after[0],
				y: after[1],
			});
		}
	} else {
		points.forEach((p, i) => {
			out.push({ type: i === 0 ? "M" : "L", x: p[0], y: p[1] });
		});
	}
	if (close) out.push({ type: "Z" });
	return out;
};
