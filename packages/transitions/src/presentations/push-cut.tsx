import { AbsoluteFill } from "@motiojs/core";
import type { CSSProperties } from "react";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "../types.js";

/** Options of `pushCut()`. */
export type PushCutProps = {
	/** Progress, from 0 to 1, at which the hard cut happens. Default 5/11. */
	cutProgress?: number;
	/** Scale the exiting scene reaches at the cut. Default 1.04. */
	outgoingScale?: number;
	/** Scale of the entering scene on its first visible frame. Default 1.04. */
	incomingStartScale?: number;
	/** Scale the entering scene reaches at the end of the transition. Default 1.07. */
	incomingEndScale?: number;
	/** CSS transform origin of both scenes. Default `"50% 50%"`. */
	transformOrigin?: string;
	/** Colour of the flash at the cut. Default `"#f5f2ed"`. */
	flashColor?: string;
	/** Peak opacity of the flash, from 0 to 1. Default 0.2. */
	flashOpacity?: number;
	/** Approximate length of the flash after the cut, in frames. Default 2. */
	flashFrames?: number;
	/** Style of the outer element while the scene is entering. */
	outerEnterStyle?: CSSProperties;
	/** Style of the outer element while the scene is exiting. */
	outerExitStyle?: CSSProperties;
	/** Style of the scaled inner element while the scene is entering. */
	innerEnterStyle?: CSSProperties;
	/** Style of the scaled inner element while the scene is exiting. */
	innerExitStyle?: CSSProperties;
};

const DEFAULTS = {
	cutProgress: 5 / 11,
	outgoingScale: 1.04,
	incomingStartScale: 1.04,
	incomingEndScale: 1.07,
	transformOrigin: "50% 50%",
	flashColor: "#f5f2ed",
	flashOpacity: 0.2,
	flashFrames: 2,
} as const;

/** Visual state of one scene of a push cut at `progress`. */
export interface PushCutState {
	visible: boolean;
	scale: number;
	/** Opacity of the flash over the entering scene; 0 for the exiting scene. */
	flash: number;
}

/** Scale, visibility and flash of a scene of `pushCut()` at `progress`. */
export function pushCutState(
	props: PushCutProps,
	presentationDirection: "entering" | "exiting",
	progress: number,
	durationInFrames: number,
): PushCutState {
	const cut = props.cutProgress ?? DEFAULTS.cutProgress;
	if (presentationDirection === "exiting") {
		const outgoing = props.outgoingScale ?? DEFAULTS.outgoingScale;
		const t = cut > 0 ? Math.min(1, Math.max(0, progress / cut)) : 1;
		return { visible: progress < cut, scale: 1 + (outgoing - 1) * t, flash: 0 };
	}
	const start = props.incomingStartScale ?? DEFAULTS.incomingStartScale;
	const end = props.incomingEndScale ?? DEFAULTS.incomingEndScale;
	const t = cut < 1 ? Math.min(1, Math.max(0, (progress - cut) / (1 - cut))) : 1;
	const flashFrames = props.flashFrames ?? DEFAULTS.flashFrames;
	const sinceCut = (progress - cut) * durationInFrames;
	const flashOpacity = props.flashOpacity ?? DEFAULTS.flashOpacity;
	const flash =
		progress < cut
			? 0
			: flashFrames > 0
				? flashOpacity * Math.max(0, 1 - sinceCut / flashFrames)
				: sinceCut === 0
					? flashOpacity
					: 0;
	return { visible: progress >= cut, scale: start + (end - start) * t, flash };
}

const PushCutPresentation = ({
	children,
	presentationDirection,
	presentationProgress,
	presentationDurationInFrames,
	passedProps,
}: TransitionPresentationComponentProps<PushCutProps>) => {
	const entering = presentationDirection === "entering";
	const state = pushCutState(
		passedProps,
		presentationDirection,
		presentationProgress,
		presentationDurationInFrames,
	);
	const outer: CSSProperties = {
		...(state.visible ? null : { visibility: "hidden" }),
		...(entering ? passedProps.outerEnterStyle : passedProps.outerExitStyle),
	};
	const inner: CSSProperties = {
		transform: `scale(${state.scale})`,
		transformOrigin: passedProps.transformOrigin ?? DEFAULTS.transformOrigin,
		...(entering ? passedProps.innerEnterStyle : passedProps.innerExitStyle),
	};
	// The entering scene starts playing at the cut, on its first visible frame.
	const cutFrame = Math.round(
		(passedProps.cutProgress ?? DEFAULTS.cutProgress) * presentationDurationInFrames,
	);
	return (
		<AbsoluteFill style={outer}>
			<AbsoluteFill style={inner}>
				{entering ? <AbsoluteFill from={cutFrame}>{children}</AbsoluteFill> : children}
			</AbsoluteFill>
			{state.flash > 0 ? (
				<AbsoluteFill
					style={{
						backgroundColor: passedProps.flashColor ?? DEFAULTS.flashColor,
						opacity: state.flash,
					}}
				/>
			) : null}
		</AbsoluteFill>
	);
};

function validateUnit(name: string, value: unknown): void {
	if (value !== undefined && (typeof value !== "number" || !(value >= 0 && value <= 1))) {
		throw new TypeError(`pushCut(): "${name}" must be a number from 0 to 1, got ${String(value)}.`);
	}
}

/**
 * A hard cut with a short punch-in on both scenes and a brief flash at the cut. Use it with a
 * monotonic timing such as `linearTiming()`.
 */
export function pushCut(props: PushCutProps = {}): TransitionPresentation<PushCutProps> {
	validateUnit("cutProgress", props.cutProgress);
	validateUnit("flashOpacity", props.flashOpacity);
	for (const key of [
		"outgoingScale",
		"incomingStartScale",
		"incomingEndScale",
		"flashFrames",
	] as const) {
		const value = props[key];
		if (
			value !== undefined &&
			(typeof value !== "number" || !Number.isFinite(value) || value < 0)
		) {
			throw new TypeError(
				`pushCut(): "${key}" must be a non-negative number, got ${String(value)}.`,
			);
		}
	}
	return { component: PushCutPresentation, props };
}
