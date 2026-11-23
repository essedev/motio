import { AbsoluteFill, useVideoConfig } from "@motiojs/core";
import { SequenceBase, type SequenceTimingProps, useTimeline } from "@motiojs/core/internals";
import {
	type CSSProperties,
	forwardRef,
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useRef,
} from "react";
import { createStarburstRenderer, type StarburstRenderer } from "./renderer.js";
import { resolveStarburst, type StarburstParams } from "./validate.js";

/** Props of `<Starburst>`. */
export interface StarburstProps extends SequenceTimingProps {
	/** Number of rays, from 2 to 100. */
	rays: number;
	/** CSS colors of the rays, at least 2, used in turn; their alpha is ignored. */
	colors: string[];
	/** Rotation in degrees, clockwise. Default 0. */
	rotation?: number;
	/** Softness of the ray edges, from 0 (hard, default) to 1. */
	smoothness?: number;
	/**
	 * Radial fade to transparency, from 0 to 1. Default 1, which leaves every canvas less than
	 * about 2.6 times wider than high untouched; smaller values fade closer to the center; 0 turns
	 * the fade off.
	 */
	vignette?: number;
	/** Horizontal shift of the origin; positive moves it right, 0.5 reaches the edge. Default 0. */
	originOffsetX?: number;
	/** Vertical shift of the origin; positive moves it up, 0.5 reaches the edge. Default 0. */
	originOffsetY?: number;
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
	"durationInFrames",
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
	const { premounted, postmounted } = useTimeline("<Starburst>");
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

const StarburstCanvas = (props: { params: StarburstParams; width?: number; height?: number }) => {
	const { params } = props;
	const config = useVideoConfig();
	const width = props.width ?? config.width;
	const height = props.height ?? config.height;
	const canvas = useRef<HTMLCanvasElement | null>(null);
	const renderer = useRef<StarburstRenderer | null>(null);

	useLayoutEffect(() => {
		const element = canvas.current;
		if (!element) return;
		renderer.current ??= createStarburstRenderer(element);
		renderer.current.draw(params);
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
 * Draws a starburst: rays of alternating colors around an origin, on a canvas filling the
 * composition (or `width` by `height` pixels), redrawn from the props on every frame, so it is the
 * same in every render. Accepts the `<Sequence>` props; the ref is the container.
 */
export const Starburst = forwardRef<HTMLDivElement, StarburstProps>(function Starburst(props, ref) {
	const params = resolveStarburst(props);
	const timing: Record<string, unknown> = {};
	for (const key of TIMING_KEYS) if (props[key] !== undefined) timing[key] = props[key];
	const { width, height, style, className, layout } = props;
	// The size goes to the container's style and to the canvas, not to the <Sequence> size props.
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
			<StarburstCanvas
				params={params}
				{...(width !== undefined ? { width } : {})}
				{...(height !== undefined ? { height } : {})}
			/>
		</AbsoluteFill>
	);
	return (
		<SequenceBase
			name="<Starburst>"
			{...(timing as SequenceTimingProps)}
			layout="none"
			componentName="Starburst"
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
