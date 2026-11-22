import { useCurrentFrame, useVideoConfig } from "@motiojs/core";
import { SequenceBase } from "@motiojs/core/internals";
import {
	Children,
	type CSSProperties,
	Fragment,
	forwardRef,
	isValidElement,
	type ReactElement,
	type ReactNode,
	type Ref,
} from "react";
import { type LayoutItem, layoutTransitionSeries, type PlacedTransition } from "./layout.js";
import { slide } from "./presentations/slide.js";
import { type TransitionProgress, TransitionProgressContext } from "./transition-progress.js";
import type { TransitionPresentation, TransitionTiming } from "./types.js";

/** Props of `<TransitionSeries>`. */
export interface TransitionSeriesProps {
	children?: ReactNode;
	/** Frame of the parent at which the series starts. Default 0. */
	from?: number;
	/**
	 * Limits how long the series is rendered, like `<Sequence durationInFrames>`. Does not change
	 * the scenes or the transitions. Default: until the end of the parent.
	 */
	durationInFrames?: number;
	trimBefore?: number;
	playbackRate?: number;
	loop?: boolean;
	freeze?: number | null;
	hidden?: boolean;
	name?: string;
	showInTimeline?: boolean;
	className?: string;
	style?: CSSProperties;
	/** Deprecated: scenes must stay absolutely positioned. `"none"` is accepted with a warning. */
	layout?: "absolute-fill" | "none";
}

/** Props of `<TransitionSeries.Sequence>`. */
export interface TransitionSeriesSequenceProps {
	children?: ReactNode;
	/** Frames of the scene; only the last sequence may be `Infinity`. */
	durationInFrames: number;
	/** Shifts this and every later sequence by this many frames (an integer). Default 0. */
	offset?: number;
	trimBefore?: number;
	playbackRate?: number;
	freeze?: number | null;
	hidden?: boolean;
	name?: string;
	showInTimeline?: boolean;
	className?: string;
	style?: CSSProperties;
	premountFor?: number;
	postmountFor?: number;
	styleWhilePremounted?: CSSProperties;
	styleWhilePostmounted?: CSSProperties;
	/** Deprecated: scenes must stay absolutely positioned. `"none"` is accepted with a warning. */
	layout?: "absolute-fill" | "none";
}

/** Motion blur settings of a transition. */
export interface TransitionMotionBlur {
	/** Shutter angle in degrees. Default 180. */
	shutterAngle?: number;
	/** Exposure samples per frame. Default 16. */
	samples?: number;
}

/** Props of `<TransitionSeries.Transition>`. */
export interface TransitionSeriesTransitionProps<
	PresentationProps extends Record<string, unknown> = Record<string, unknown>,
> {
	/** How long the transition lasts and how its progress advances. */
	timing: TransitionTiming;
	/** The visual effect. Default: `slide()`. */
	presentation?: TransitionPresentation<PresentationProps>;
	/** Motion blur; needs an HTML-in-canvas presentation, which Motio does not support yet. */
	motionBlur?: TransitionMotionBlur;
}

/** Props of `<TransitionSeries.Overlay>`. */
export interface TransitionSeriesOverlayProps {
	children?: ReactNode;
	/** Frames the overlay is shown, centred on the cut. A positive integer. */
	durationInFrames: number;
	/** Shifts the overlay from the centre of the cut; positive is later. Default 0. */
	offset?: number;
	hidden?: boolean;
	premountFor?: number;
	postmountFor?: number;
	styleWhilePremounted?: CSSProperties;
	styleWhilePostmounted?: CSSProperties;
}

const markerError = (name: string) =>
	new Error(`<${name}> can only be used as a direct child of <TransitionSeries>.`);

const SequenceMarker = (
	_props: TransitionSeriesSequenceProps & { ref?: Ref<HTMLDivElement> },
): ReactNode => {
	throw markerError("TransitionSeries.Sequence");
};
SequenceMarker.displayName = "TransitionSeries.Sequence";

const TransitionMarker = <PresentationProps extends Record<string, unknown>>(
	_props: TransitionSeriesTransitionProps<PresentationProps>,
): ReactNode => {
	throw markerError("TransitionSeries.Transition");
};
TransitionMarker.displayName = "TransitionSeries.Transition";

const OverlayMarker = (_props: TransitionSeriesOverlayProps): ReactNode => {
	throw markerError("TransitionSeries.Overlay");
};
OverlayMarker.displayName = "TransitionSeries.Overlay";

type Child =
	| { kind: "sequence"; element: ReactElement<TransitionSeriesSequenceProps> }
	| { kind: "transition"; element: ReactElement<TransitionSeriesTransitionProps> }
	| { kind: "overlay"; element: ReactElement<TransitionSeriesOverlayProps> };

function describe(child: unknown): string {
	if (isValidElement(child)) {
		const type = child.type as { displayName?: string; name?: string } | string;
		const name = typeof type === "string" ? type : (type.displayName ?? type.name ?? "unknown");
		return `<${name}>`;
	}
	return JSON.stringify(child);
}

function flatten(children: ReactNode, out: Child[] = []): Child[] {
	Children.forEach(children, (child) => {
		if (child === null || child === undefined || typeof child === "boolean") return;
		if (isValidElement(child) && child.type === Fragment) {
			flatten((child.props as { children?: ReactNode }).children, out);
			return;
		}
		if (isValidElement(child)) {
			if (child.type === SequenceMarker) {
				out.push({
					kind: "sequence",
					element: child as ReactElement<TransitionSeriesSequenceProps>,
				});
				return;
			}
			if (child.type === TransitionMarker) {
				out.push({
					kind: "transition",
					element: child as ReactElement<TransitionSeriesTransitionProps>,
				});
				return;
			}
			if (child.type === OverlayMarker) {
				out.push({ kind: "overlay", element: child as ReactElement<TransitionSeriesOverlayProps> });
				return;
			}
		}
		throw new Error(
			`<TransitionSeries> only accepts <TransitionSeries.Sequence>, <TransitionSeries.Transition> and <TransitionSeries.Overlay> children, got ${describe(child)}.`,
		);
	});
	return out;
}

/** The ref of an element, in React 19 (a prop) and React 18 (a field). */
function elementRef(el: ReactElement): Ref<HTMLDivElement> | undefined {
	const props = el.props as { ref?: Ref<HTMLDivElement> };
	if ("ref" in props) return props.ref;
	return (el as unknown as { ref?: Ref<HTMLDivElement> }).ref ?? undefined;
}

const warned = new Set<string>();
function warnOnce(key: string, message: string): void {
	if (warned.has(key)) return;
	warned.add(key);
	console.warn(message);
}

const LAYOUT_NONE_WARNING =
	'layout="none" is deprecated in <TransitionSeries> and <TransitionSeries.Sequence>: scenes must stay absolutely positioned. Remove the "layout" prop. Remotion 5.0 throws for it.';

/**
 * Progress of `transition` at `frame`, or null when the frame is outside of it. The entering
 * scene keeps its presentation one frame longer than the exiting scene is shown: the reference
 * stills show a spring slide still short of its end (progress 0.996) on the frame after the
 * exiting scene unmounted. For timings that reach 1 at their duration this frame looks the same
 * as the unwrapped scene.
 */
function progressAt(
	transition: PlacedTransition | null,
	direction: "entering" | "exiting",
	frame: number,
	fps: number,
): number | null {
	if (!transition) return null;
	const local = frame - transition.start;
	const last =
		direction === "entering" ? transition.durationInFrames : transition.durationInFrames - 1;
	if (local < 0 || local > last) return null;
	return transition.timing.getProgress({ frame: local, fps });
}

function wrap(
	content: ReactNode,
	transition: PlacedTransition,
	direction: "entering" | "exiting",
	progress: number,
): ReactNode {
	const { component: Presentation, props } = transition.presentation;
	return (
		<Presentation
			presentationDirection={direction}
			presentationProgress={progress}
			presentationDurationInFrames={transition.durationInFrames}
			passedProps={props}
		>
			{content}
		</Presentation>
	);
}

function SeriesContent({ items }: { items: Child[] }): ReactNode {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const layoutItems: LayoutItem[] = items.map((item) => {
		if (item.kind === "sequence") {
			const { durationInFrames, offset, playbackRate } = item.element.props;
			return { kind: "sequence", durationInFrames, offset, playbackRate };
		}
		if (item.kind === "overlay") {
			const { durationInFrames, offset } = item.element.props;
			return { kind: "overlay", durationInFrames, offset };
		}
		const { timing, presentation, motionBlur } = item.element.props;
		if (!timing || typeof timing.getDurationInFrames !== "function") {
			throw new Error(
				'<TransitionSeries.Transition>: the "timing" prop is required, for example timing={linearTiming({durationInFrames: 30})}.',
			);
		}
		if (motionBlur) {
			warnOnce(
				"motionBlur",
				"<TransitionSeries.Transition>: motionBlur needs an HTML-in-canvas presentation, which Motio does not support yet. It has no effect.",
			);
		}
		return {
			kind: "transition",
			timing,
			presentation: (presentation ?? slide()) as TransitionPresentation<Record<string, unknown>>,
		};
	});
	const layout = layoutTransitionSeries(layoutItems, fps);

	const sequences = layout.sequences.map((placed) => {
		const item = items[placed.index] as Extract<Child, { kind: "sequence" }>;
		const {
			children,
			durationInFrames,
			offset: _offset,
			layout: sequenceLayout,
			...rest
		} = item.element.props as TransitionSeriesSequenceProps & { ref?: unknown };
		delete (rest as { ref?: unknown }).ref;
		if (sequenceLayout === "none") warnOnce("layout", LAYOUT_NONE_WARNING);
		const entering = progressAt(placed.enter, "entering", frame, fps);
		const exiting = progressAt(placed.exit, "exiting", frame, fps);
		let content: ReactNode = children;
		if (placed.enter && entering !== null) {
			content = wrap(content, placed.enter, "entering", entering);
		}
		if (placed.exit && exiting !== null) {
			content = wrap(content, placed.exit, "exiting", exiting);
		}
		const progress: TransitionProgress = {
			entering: entering ?? 1,
			exiting: exiting ?? 0,
			isInTransitionSeries: true,
		};
		return (
			<SequenceBase
				key={item.element.key ?? `sequence-${placed.index}`}
				{...rest}
				ref={elementRef(item.element)}
				componentName="TransitionSeries.Sequence"
				layout={sequenceLayout ?? "absolute-fill"}
				from={placed.from}
				durationInFrames={durationInFrames}
			>
				<TransitionProgressContext.Provider value={progress}>
					{content}
				</TransitionProgressContext.Provider>
			</SequenceBase>
		);
	});

	const overlays = layout.overlays.map((placed) => {
		const item = items[placed.index] as Extract<Child, { kind: "overlay" }>;
		const { children, durationInFrames: _d, offset: _o, ...rest } = item.element.props;
		return (
			<SequenceBase
				key={item.element.key ?? `overlay-${placed.index}`}
				{...rest}
				componentName="TransitionSeries.Overlay"
				from={placed.from}
				durationInFrames={placed.durationInFrames}
			>
				{children}
			</SequenceBase>
		);
	});

	return (
		<>
			{sequences}
			{overlays}
		</>
	);
}

const TransitionSeriesImpl = forwardRef<HTMLDivElement, TransitionSeriesProps>(
	function TransitionSeries(props, ref) {
		const { children, layout, ...sequenceProps } = props;
		if (layout === "none") warnOnce("layout", LAYOUT_NONE_WARNING);
		const items = flatten(children);
		return (
			<SequenceBase
				{...sequenceProps}
				ref={ref}
				layout={layout ?? "absolute-fill"}
				componentName="TransitionSeries"
			>
				<SeriesContent items={items} />
			</SequenceBase>
		);
	},
);

/**
 * Like `<Series>`, but with transitions: `<TransitionSeries.Sequence>` scenes play one after the
 * other, a `<TransitionSeries.Transition>` between two of them overlaps them for its duration and
 * animates both with its presentation, and a `<TransitionSeries.Overlay>` shows something on top
 * of a cut without overlapping the scenes. A transition first or last animates the entrance or
 * exit of a single scene.
 */
export const TransitionSeries = Object.assign(TransitionSeriesImpl, {
	/** A scene of a `<TransitionSeries>`. */
	Sequence: SequenceMarker,
	/** A transition between the two neighbouring scenes of a `<TransitionSeries>`. */
	Transition: TransitionMarker,
	/** Content shown on top of the cut between two scenes, without overlapping them. */
	Overlay: OverlayMarker,
});
