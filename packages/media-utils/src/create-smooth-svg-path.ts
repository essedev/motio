/** A point of `createSmoothSvgPath()`. */
export interface SvgPoint {
	x: number;
	y: number;
}

const SMOOTHING = 0.2;

function controlPoint(
	current: SvgPoint,
	previous: SvgPoint | undefined,
	next: SvgPoint | undefined,
	reverse: boolean,
): [number, number] {
	const p = previous ?? current;
	const n = next ?? current;
	const dx = n.x - p.x;
	const dy = n.y - p.y;
	const angle = Math.atan2(dy, dx) + (reverse ? Math.PI : 0);
	const length = Math.sqrt(dx ** 2 + dy ** 2) * SMOOTHING;
	return [current.x + Math.cos(angle) * length, current.y + Math.sin(angle) * length];
}

/**
 * An SVG path through `points`, joined by cubic Bézier (`C`) segments whose control points follow
 * the direction between each point's neighbours. Returns `""` for no points.
 */
export function createSmoothSvgPath({ points }: { points: SvgPoint[] }): string {
	let path = "";
	points.forEach((point, i) => {
		if (i === 0) {
			path = `M ${point.x},${point.y}`;
			return;
		}
		const previous = points[i - 1] as SvgPoint;
		const [sx, sy] = controlPoint(previous, points[i - 2], point, false);
		const [ex, ey] = controlPoint(point, previous, points[i + 1], true);
		path += ` C ${sx},${sy} ${ex},${ey} ${point.x},${point.y}`;
	});
	return path;
}
