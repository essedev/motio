import { AbsoluteFill } from "@motiojs/core";
import type { CSSProperties } from "react";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "../types.js";

/** Where the wipe of `wipe()` starts. */
export type WipeDirection =
	| "from-left"
	| "from-top-left"
	| "from-top"
	| "from-top-right"
	| "from-right"
	| "from-bottom-right"
	| "from-bottom"
	| "from-bottom-left";

/** Options of `wipe()`. */
export type WipeProps = {
	/** Side or corner the entering scene is revealed from. Default `"from-left"`. */
	direction?: WipeDirection;
	/** Style of the outer element while the scene is entering. */
	outerEnterStyle?: CSSProperties;
	/** Style of the outer element while the scene is exiting. */
	outerExitStyle?: CSSProperties;
	/** Style of the inner element while the scene is entering. */
	innerEnterStyle?: CSSProperties;
	/** Style of the inner element while the scene is exiting. */
	innerExitStyle?: CSSProperties;
};

const DIRECTIONS: readonly WipeDirection[] = [
	"from-left",
	"from-top-left",
	"from-top",
	"from-top-right",
	"from-right",
	"from-bottom-right",
	"from-bottom",
	"from-bottom-left",
];

type Point = readonly [number, number];

/** Revealed area for a wipe from the top-left corner, in fractions of the scene size. */
function fromTopLeft(p: number): Point[] {
	if (p <= 0.5) {
		return [
			[0, 0],
			[2 * p, 0],
			[0, 2 * p],
		];
	}
	return [
		[0, 0],
		[1, 0],
		[1, 2 * p - 1],
		[2 * p - 1, 1],
		[0, 1],
	];
}

/** Polygon of the area revealed by a wipe at `progress`, in fractions of the scene size. */
export function wipePolygon(direction: WipeDirection, progress: number): Point[] {
	const p = Math.min(1, Math.max(0, progress));
	const flipX = (pts: Point[]): Point[] => pts.map(([x, y]) => [1 - x, y]);
	const flipY = (pts: Point[]): Point[] => pts.map(([x, y]) => [x, 1 - y]);
	switch (direction) {
		case "from-left":
			return [
				[0, 0],
				[p, 0],
				[p, 1],
				[0, 1],
			];
		case "from-right":
			return flipX(wipePolygon("from-left", p));
		case "from-top":
			return [
				[0, 0],
				[1, 0],
				[1, p],
				[0, p],
			];
		case "from-bottom":
			return flipY(wipePolygon("from-top", p));
		case "from-top-left":
			return fromTopLeft(p);
		case "from-top-right":
			return flipX(fromTopLeft(p));
		case "from-bottom-left":
			return flipY(fromTopLeft(p));
		case "from-bottom-right":
			return flipX(flipY(fromTopLeft(p)));
	}
}

const pct = (n: number) => `${Number((n * 100).toFixed(6))}%`;

/** The CSS `clip-path` of the entering scene of a wipe at `progress`. */
export function wipeClipPath(direction: WipeDirection, progress: number): string {
	return `polygon(${wipePolygon(direction, progress)
		.map(([x, y]) => `${pct(x)} ${pct(y)}`)
		.join(", ")})`;
}

const WipePresentation = ({
	children,
	presentationDirection,
	presentationProgress,
	passedProps,
}: TransitionPresentationComponentProps<WipeProps>) => {
	const entering = presentationDirection === "entering";
	const direction = passedProps.direction ?? "from-left";
	const inner: CSSProperties = {
		...(entering ? { clipPath: wipeClipPath(direction, presentationProgress) } : null),
		...(entering ? passedProps.innerEnterStyle : passedProps.innerExitStyle),
	};
	const outer = entering ? passedProps.outerEnterStyle : passedProps.outerExitStyle;
	return (
		<AbsoluteFill {...(outer ? { style: outer } : null)}>
			<AbsoluteFill style={inner}>{children}</AbsoluteFill>
		</AbsoluteFill>
	);
};

/** The entering scene is revealed over the exiting one from a side or a corner. */
export function wipe(props: WipeProps = {}): TransitionPresentation<WipeProps> {
	if (props.direction !== undefined && !DIRECTIONS.includes(props.direction)) {
		throw new TypeError(
			`wipe(): "direction" must be one of ${DIRECTIONS.join(", ")}, got ${String(props.direction)}.`,
		);
	}
	return { component: WipePresentation, props };
}
