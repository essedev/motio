import { AbsoluteFill } from "@motiojs/core";
import type { CSSProperties } from "react";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "../types.js";

/** Where the entering scene of `slide()` comes from. */
export type SlideDirection = "from-left" | "from-right" | "from-top" | "from-bottom";

/** Options of `slide()`. */
export type SlideProps = {
	/** Where the entering scene comes from. Default `"from-left"`. */
	direction?: SlideDirection;
	/** Style of the container while the scene is entering. */
	enterStyle?: CSSProperties;
	/** Style of the container while the scene is exiting. */
	exitStyle?: CSSProperties;
};

const DIRECTIONS: readonly SlideDirection[] = [
	"from-left",
	"from-right",
	"from-top",
	"from-bottom",
];

/** CSS transform of a scene of `slide()` at `progress`. */
export function slideTransform(
	direction: SlideDirection,
	presentationDirection: "entering" | "exiting",
	progress: number,
): string {
	const entering = presentationDirection === "entering";
	// Offset in percent of the scene size along the axis of motion.
	const sign = direction === "from-left" || direction === "from-top" ? 1 : -1;
	const offset = entering ? sign * (progress - 1) * 100 : sign * progress * 100;
	const axis = direction === "from-left" || direction === "from-right" ? "X" : "Y";
	return `translate${axis}(${offset}%)`;
}

const SlidePresentation = ({
	children,
	presentationDirection,
	presentationProgress,
	passedProps,
}: TransitionPresentationComponentProps<SlideProps>) => {
	const direction = passedProps.direction ?? "from-left";
	const style: CSSProperties = {
		transform: slideTransform(direction, presentationDirection, presentationProgress),
		...(presentationDirection === "entering" ? passedProps.enterStyle : passedProps.exitStyle),
	};
	return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};

/** The entering scene slides in and pushes the exiting scene out. */
export function slide(props: SlideProps = {}): TransitionPresentation<SlideProps> {
	if (props.direction !== undefined && !DIRECTIONS.includes(props.direction)) {
		throw new TypeError(
			`slide(): "direction" must be one of ${DIRECTIONS.join(", ")}, got ${String(props.direction)}.`,
		);
	}
	return { component: SlidePresentation, props };
}
