import { AbsoluteFill } from "@motiojs/core";
import type { CSSProperties } from "react";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "../types.js";

/** Options of `none()`. */
export type NoneProps = {
	/** Style of the container while the scene is entering. */
	enterStyle?: CSSProperties;
	/** Style of the container while the scene is exiting. */
	exitStyle?: CSSProperties;
};

const NonePresentation = ({
	children,
	presentationDirection,
	passedProps,
}: TransitionPresentationComponentProps<NoneProps>) => {
	const style =
		presentationDirection === "entering" ? passedProps.enterStyle : passedProps.exitStyle;
	return <AbsoluteFill {...(style ? { style } : null)}>{children}</AbsoluteFill>;
};

/**
 * A presentation without a visual effect of its own: both scenes are shown as they are. Drive
 * the effect yourself with `useTransitionProgress()`.
 */
export function none(props: NoneProps = {}): TransitionPresentation<NoneProps> {
	return { component: NonePresentation, props };
}
