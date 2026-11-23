import type { ComponentType, ReactNode } from "react";
import type { HtmlInCanvasShader } from "./html-in-canvas/make-html-in-canvas-presentation.js";

/** Which side of a transition a scene is on. */
export type PresentationDirection = "entering" | "exiting";

/**
 * How a transition advances: its length in frames and its progress (0 to 1) at each frame of
 * the transition. Both functions must be deterministic.
 */
export interface TransitionTiming {
	/** Length of the transition in frames at the given frame rate. */
	getDurationInFrames: (options: { fps: number }) => number;
	/** Progress of the transition at `frame`, counted from the first frame of the transition. */
	getProgress: (options: { frame: number; fps: number }) => number;
}

/** Props passed to the component of a presentation, once for each scene of the transition. */
export interface TransitionPresentationComponentProps<
	PresentationProps extends Record<string, unknown> = Record<string, unknown>,
> {
	/** The scene to wrap. */
	children?: ReactNode;
	/** Whether the wrapped scene is the one coming in or the one going out. */
	presentationDirection: PresentationDirection;
	/** Progress of the transition, from 0 to 1 as returned by the timing. */
	presentationProgress: number;
	/** Length of the transition in frames. */
	presentationDurationInFrames: number;
	/** The `props` of the presentation. */
	passedProps: PresentationProps;
}

/**
 * A visual effect between two scenes: a component that wraps the entering and the exiting
 * scene, and the props it receives as `passedProps`.
 */
export interface TransitionPresentation<
	PresentationProps extends Record<string, unknown> = Record<string, unknown>,
> {
	component: ComponentType<TransitionPresentationComponentProps<PresentationProps>>;
	props: PresentationProps;
	/**
	 * The canvas shader of an HTML-in-canvas presentation. When present, `<TransitionSeries>` draws
	 * the scenes next to the transition through it instead of wrapping them in `component`.
	 */
	canvas?: HtmlInCanvasShader<PresentationProps>;
}
