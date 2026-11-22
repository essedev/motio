import { AbsoluteFill } from "@motiojs/core";
import type { CSSProperties } from "react";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "../types.js";
import { validateSize } from "./size.js";

/** Options of `iris()`. */
export type IrisProps = {
	/** Width of the video. */
	width: number;
	/** Height of the video. */
	height: number;
	/** Style of the outer element while the scene is entering. */
	outerEnterStyle?: CSSProperties;
	/** Style of the outer element while the scene is exiting. */
	outerExitStyle?: CSSProperties;
	/** Style of the inner element while the scene is entering. */
	innerEnterStyle?: CSSProperties;
	/** Style of the inner element while the scene is exiting. */
	innerExitStyle?: CSSProperties;
};

/** Radius of the iris at `progress`: from 0 to half the diagonal, where it covers the corners. */
export function irisRadius(width: number, height: number, progress: number): number {
	return (progress * Math.sqrt(width * width + height * height)) / 2;
}

const IrisPresentation = ({
	children,
	presentationDirection,
	presentationProgress,
	passedProps,
}: TransitionPresentationComponentProps<IrisProps>) => {
	const entering = presentationDirection === "entering";
	const { width, height } = passedProps;
	const radius = Math.max(0, irisRadius(width, height, presentationProgress));
	const inner: CSSProperties = {
		...(entering ? { clipPath: `circle(${Number(radius.toFixed(4))}px at 50% 50%)` } : null),
		...(entering ? passedProps.innerEnterStyle : passedProps.innerExitStyle),
	};
	const outer = entering ? passedProps.outerEnterStyle : passedProps.outerExitStyle;
	return (
		<AbsoluteFill {...(outer ? { style: outer } : null)}>
			<AbsoluteFill style={inner}>{children}</AbsoluteFill>
		</AbsoluteFill>
	);
};

/**
 * The entering scene appears through a circle that grows from the centre until it covers the
 * frame, like a camera iris opening. Pass the size of the video.
 */
export function iris(props: IrisProps): TransitionPresentation<IrisProps> {
	validateSize("iris", props?.width, props?.height);
	return { component: IrisPresentation, props };
}
