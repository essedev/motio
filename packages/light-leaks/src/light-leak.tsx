import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "@motiojs/core";
import { SequenceBase, type SequenceTimingProps, useTimeline } from "@motiojs/core/internals";
import {
	type CSSProperties,
	forwardRef,
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useRef,
} from "react";
import { createLightLeakRenderer, type LightLeakRenderer } from "./renderer.js";
import { lightLeakProgress, resolveLightLeak } from "./validate.js";

/** Props of `<LightLeak>`. */
export interface LightLeakProps extends Omit<SequenceTimingProps, "durationInFrames"> {
	/**
	 * Length of the leak in frames: it reveals over the first half and retracts over the second.
	 * Default: the duration of the composition or of the enclosing sequence.
	 */
	durationInFrames?: number;
	/** Shape of the pattern; different seeds give different leaks. Default 0. */
	seed?: number;
	/** Hue rotation in degrees, from 0 (yellow to orange, default) to 360. */
	hueShift?: number;
	/** Width of the canvas in pixels. Default: the width of the composition. */
	width?: number;
	/** Height of the canvas in pixels. Default: the height of the composition. */
	height?: number;
	/** Styles of the container (an absolute fill). */
	style?: CSSProperties;
	/** Class of the container. */
	className?: string;
	/** `"absolute-fill"` (default) wraps the canvas in a container; `"none"` does not. */
	layout?: "absolute-fill" | "none";
}

const TIMING_KEYS = [
	"from",
	"trimBefore",
	"playbackRate",
	"loop",
	"freeze",
	"hidden",
	"name",
	"showInTimeline",
	"premountFor",
	"postmountFor",
] as const;

interface ContainerProps {
	style: CSSProperties | undefined;
	className: string | undefined;
	styleWhilePremounted: CSSProperties | undefined;
	styleWhilePostmounted: CSSProperties | undefined;
	children: ReactNode;
}

/**
 * The container Remotion renders: an absolute fill without `flex-direction`, like a `<Sequence>`'s,
 * but premounted or postmounted it gets `opacity: 0; pointer-events: none` (then the
 * `styleWhile...` styles), where a `<Sequence>` gets `display: none` (recorded markup).
 */
const Container = forwardRef<HTMLDivElement, ContainerProps>(function Container(props, ref) {
	const { premounted, postmounted } = useTimeline("<LightLeak>");
	let style: CSSProperties = { flexDirection: undefined, ...props.style };
	if (premounted)
		style = { ...style, opacity: 0, pointerEvents: "none", ...props.styleWhilePremounted };
	else if (postmounted) {
		style = { ...style, opacity: 0, pointerEvents: "none", ...props.styleWhilePostmounted };
	}
	return (
		<AbsoluteFill
			ref={ref}
			style={style}
			{...(props.className ? { className: props.className } : {})}
		>
			{props.children}
		</AbsoluteFill>
	);
});

const LightLeakCanvas = (props: {
	seed: number;
	hueShift: number;
	durationInFrames: number;
	width?: number;
	height?: number;
}) => {
	const { seed, hueShift, durationInFrames } = props;
	const frame = useCurrentFrame();
	const config = useVideoConfig();
	const width = props.width ?? config.width;
	const height = props.height ?? config.height;
	const progress = lightLeakProgress(frame, durationInFrames);
	const canvas = useRef<HTMLCanvasElement | null>(null);
	const renderer = useRef<LightLeakRenderer | null>(null);

	useLayoutEffect(() => {
		const element = canvas.current;
		if (!element) return;
		renderer.current ??= createLightLeakRenderer(element);
		renderer.current.draw({ seed, hueShift, progress });
	});

	useEffect(
		() => () => {
			renderer.current?.dispose();
			renderer.current = null;
		},
		[],
	);

	return <canvas ref={canvas} width={width} height={height} />;
};

/**
 * Draws a light leak over its area: a warm glow that reveals over the first half of
 * `durationInFrames` and retracts over the second, recomputed from the frame on every render.
 * Accepts the `<Sequence>` props; the ref is the container. Motio draws its own pattern, not
 * Remotion's: the props, markup and timing match, the pixels do not.
 */
export const LightLeak = forwardRef<HTMLDivElement, LightLeakProps>(function LightLeak(props, ref) {
	const { seed, hueShift } = resolveLightLeak(props);
	const config = useVideoConfig();
	const durationInFrames = props.durationInFrames ?? config.durationInFrames;
	// Remotion accepts a NaN duration and then renders nothing.
	if (Number.isNaN(durationInFrames)) return null;
	const timing: Record<string, unknown> = { durationInFrames };
	for (const key of TIMING_KEYS) if (props[key] !== undefined) timing[key] = props[key];
	const { width, height, style, className, layout } = props;
	const sized =
		width === undefined && height === undefined
			? style
			: {
					...style,
					...(width !== undefined ? { width } : {}),
					...(height !== undefined ? { height } : {}),
				};
	const fill = (
		<AbsoluteFill>
			<LightLeakCanvas
				seed={seed}
				hueShift={hueShift}
				durationInFrames={durationInFrames}
				{...(width !== undefined ? { width } : {})}
				{...(height !== undefined ? { height } : {})}
			/>
		</AbsoluteFill>
	);
	return (
		<SequenceBase
			name="<LightLeak>"
			{...(timing as SequenceTimingProps)}
			layout="none"
			componentName="LightLeak"
		>
			{layout === "none" ? (
				fill
			) : (
				<Container
					ref={ref}
					style={sized}
					className={className}
					styleWhilePremounted={props.styleWhilePremounted}
					styleWhilePostmounted={props.styleWhilePostmounted}
				>
					{fill}
				</Container>
			)}
		</SequenceBase>
	);
});
