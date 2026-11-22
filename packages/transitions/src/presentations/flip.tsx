import { AbsoluteFill } from "@motiojs/core";
import type { CSSProperties } from "react";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "../types.js";

/** Where the flip of `flip()` comes from. */
export type FlipDirection = "from-left" | "from-right" | "from-top" | "from-bottom";

/** Options of `flip()`. */
export type FlipProps = {
	/** Side the flip comes from. Default `"from-left"`. */
	direction?: FlipDirection;
	/** CSS `perspective` of the flip, in pixels. Default 1000. */
	perspective?: number;
	/** Style of the outer element while the scene is entering. */
	outerEnterStyle?: CSSProperties;
	/** Style of the outer element while the scene is exiting. */
	outerExitStyle?: CSSProperties;
	/** Style of the inner element while the scene is entering. */
	innerEnterStyle?: CSSProperties;
	/** Style of the inner element while the scene is exiting. */
	innerExitStyle?: CSSProperties;
};

const DIRECTIONS: readonly FlipDirection[] = ["from-left", "from-right", "from-top", "from-bottom"];

/**
 * CSS transform of a scene of `flip()`: the exiting scene turns by 180 degrees and the entering
 * scene is its back side, so it arrives from -180 degrees to 0.
 */
export function flipTransform(
	direction: FlipDirection,
	presentationDirection: "entering" | "exiting",
	progress: number,
): string {
	const sign = direction === "from-left" || direction === "from-bottom" ? 1 : -1;
	const turned = progress * 180;
	const angle = presentationDirection === "exiting" ? sign * turned : sign * (turned - 180);
	const axis = direction === "from-left" || direction === "from-right" ? "Y" : "X";
	return `rotate${axis}(${angle}deg)`;
}

const FlipPresentation = ({
	children,
	presentationDirection,
	presentationProgress,
	passedProps,
}: TransitionPresentationComponentProps<FlipProps>) => {
	const entering = presentationDirection === "entering";
	const direction = passedProps.direction ?? "from-left";
	const outer: CSSProperties = {
		perspective: passedProps.perspective ?? 1000,
		...(entering ? passedProps.outerEnterStyle : passedProps.outerExitStyle),
	};
	const inner: CSSProperties = {
		transform: flipTransform(direction, presentationDirection, presentationProgress),
		backfaceVisibility: "hidden",
		WebkitBackfaceVisibility: "hidden",
		...(entering ? passedProps.innerEnterStyle : passedProps.innerExitStyle),
	};
	return (
		<AbsoluteFill style={outer}>
			<AbsoluteFill style={inner}>{children}</AbsoluteFill>
		</AbsoluteFill>
	);
};

/** The exiting scene flips over by 180 degrees and shows the entering scene on its back. */
export function flip(props: FlipProps = {}): TransitionPresentation<FlipProps> {
	if (props.direction !== undefined && !DIRECTIONS.includes(props.direction)) {
		throw new TypeError(
			`flip(): "direction" must be one of ${DIRECTIONS.join(", ")}, got ${String(props.direction)}.`,
		);
	}
	return { component: FlipPresentation, props };
}
