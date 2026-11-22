import { AbsoluteFill } from "@motiojs/core";
import type { CSSProperties } from "react";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "../types.js";

/** Options of `fade()`. */
export type FadeProps = {
	/** Style of the container while the scene is entering. */
	enterStyle?: CSSProperties;
	/** Style of the container while the scene is exiting. */
	exitStyle?: CSSProperties;
	/**
	 * Also fade out the exiting scene. Default false: with two opaque scenes, fading both would
	 * let the content underneath show through halfway.
	 */
	shouldFadeOutExitingScene?: boolean;
};

const FadePresentation = ({
	children,
	presentationDirection,
	presentationProgress,
	passedProps,
}: TransitionPresentationComponentProps<FadeProps>) => {
	const entering = presentationDirection === "entering";
	const opacity = entering
		? presentationProgress
		: passedProps.shouldFadeOutExitingScene
			? 1 - presentationProgress
			: 1;
	const style: CSSProperties = {
		opacity,
		...(entering ? passedProps.enterStyle : passedProps.exitStyle),
	};
	return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};

/** The entering scene fades in over the exiting one, which stays as it is unless asked to fade. */
export function fade(props: FadeProps = {}): TransitionPresentation<FadeProps> {
	return { component: FadePresentation, props };
}
