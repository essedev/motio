import {
	type CanvasHTMLAttributes,
	type CSSProperties,
	type ForwardedRef,
	forwardRef,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { continueRender, delayRender } from "../readiness/delay-render.js";
import { useCurrentFrame, useTimeline, useVideoConfig } from "../timeline/hooks.js";
import { cropClipPath, SequenceBase, type SequenceTimingProps } from "../timeline/sequence.js";
import {
	acquireAnimatedImage,
	type DecodedAnimatedImage,
	isReleased,
} from "./animated-image-loader.js";
import {
	type AnimatedImageLoopBehavior,
	animatedImageFrameAt,
	animatedImageTimeAt,
} from "./animated-image-timing.js";

export type { AnimatedImageLoopBehavior } from "./animated-image-timing.js";

/** How the image fills the canvas. */
export type AnimatedImageFillMode = "fill" | "contain" | "cover";

/** Props of `<AnimatedImage>`. Other canvas attributes (`className`, `id`, ...) go to the canvas. */
export interface AnimatedImageProps
	extends Omit<
			CanvasHTMLAttributes<HTMLCanvasElement>,
			"src" | "width" | "height" | "style" | "onError" | "hidden" | "children"
		>,
		Omit<SequenceTimingProps, "playbackRate"> {
	/** URL of a GIF, APNG, WebP or AVIF file (with CORS when on another origin). */
	src: string;
	/** Width of the canvas in pixels. Default: the image's width. */
	width?: number;
	/** Height of the canvas in pixels. Default: the image's height. */
	height?: number;
	/** `"fill"` (default) stretches, `"contain"` fits inside, `"cover"` fills and crops. */
	fit?: AnimatedImageFillMode;
	/** Speed: 2 plays twice as fast. Positive and finite. Default 1. */
	playbackRate?: number;
	/** `"loop"` (default), `"pause-after-finish"` (hold the last frame) or `"clear-after-finish"`. */
	loopBehavior?: AnimatedImageLoopBehavior;
	/** Called when the image cannot be loaded or decoded; the render then goes on without it. */
	onError?: (error: Error) => void;
	/** Styles of the canvas. Use `width` and `height` for its size in pixels. */
	style?: CSSProperties;
	/** Passed to `fetch()` (headers, credentials); a `signal` has no effect. */
	requestInit?: RequestInit;
	/** Crop ratios between 0 and 1, applied to the canvas with a clip path. */
	cropLeft?: number;
	cropRight?: number;
	cropTop?: number;
	cropBottom?: number;
	/** Not supported by Motio: must be empty or absent. */
	effects?: readonly unknown[];
	/** Not supported by Motio: ignored, as there are no effects. */
	effectsOutputSize?: unknown;
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

const HIDDEN: CSSProperties = { display: "none", pointerEvents: "none" };

/** Where an image of the given size goes on a canvas, for a fit mode (unknown modes fill). */
export function animatedImageFitRect(
	fit: string,
	imageWidth: number,
	imageHeight: number,
	canvasWidth: number,
	canvasHeight: number,
): { x: number; y: number; width: number; height: number } {
	if ((fit !== "contain" && fit !== "cover") || imageWidth <= 0 || imageHeight <= 0) {
		return { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
	}
	const ratio = (fit === "contain" ? Math.min : Math.max)(
		canvasWidth / imageWidth,
		canvasHeight / imageHeight,
	);
	const width = imageWidth * ratio;
	const height = imageHeight * ratio;
	return { x: (canvasWidth - width) / 2, y: (canvasHeight - height) / 2, width, height };
}

type CanvasProps = Omit<
	AnimatedImageProps,
	(typeof TIMING_KEYS)[number] | "effects" | "effectsOutputSize"
>;

type LoadState =
	| { status: "loading" }
	| { status: "loaded"; image: DecodedAnimatedImage }
	| { status: "failed"; error: Error };

const failure = (src: string, reason: unknown) =>
	new Error(
		`<AnimatedImage> could not load ${src}: ${reason instanceof Error ? reason.message : String(reason)}`,
		{ cause: reason },
	);

const AnimatedImageCanvas = forwardRef(function AnimatedImageCanvas(
	props: CanvasProps,
	forwarded: ForwardedRef<HTMLCanvasElement>,
) {
	const {
		src,
		width,
		height,
		fit = "fill",
		loopBehavior = "loop",
		onError,
		style,
		requestInit,
		cropLeft = 0,
		cropRight = 0,
		cropTop = 0,
		cropBottom = 0,
		styleWhilePremounted,
		styleWhilePostmounted,
		...canvasAttributes
	} = props;
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const { premounted, postmounted } = useTimeline("<AnimatedImage>");
	const [loadHandle] = useState(() => delayRender(`Loading <AnimatedImage> with src=${src}`));
	const [state, setState] = useState<LoadState>({ status: "loading" });
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const onErrorRef = useRef(onError);
	onErrorRef.current = onError;
	const reported = useRef<Error | null>(null);

	const setRef = useCallback(
		(node: HTMLCanvasElement | null) => {
			canvasRef.current = node;
			if (typeof forwarded === "function") forwarded(node);
			else if (forwarded) forwarded.current = node;
		},
		[forwarded],
	);

	// Keyed by src, so this runs once per file; requestInit is read once per src.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useEffect(() => {
		let active = true;
		const { promise, release } = acquireAnimatedImage(src, requestInit ? { requestInit } : {});
		promise.then(
			(image) => {
				if (active) setState({ status: "loaded", image });
			},
			(reason: unknown) => {
				if (active && !isReleased(reason)) {
					setState({ status: "failed", error: failure(src, reason) });
				}
			},
		);
		return () => {
			active = false;
			release();
			continueRender(loadHandle);
		};
	}, [src, loadHandle]);

	// A failure goes to onError once; without onError it fails the render, like <Gif>.
	if (state.status === "failed" && !onErrorRef.current) {
		throw new Error(
			`${state.error.message} Pass onError to handle a failed load without failing the render.`,
			{ cause: state.error.cause },
		);
	}
	useEffect(() => {
		if (state.status !== "failed" || reported.current === state.error) return;
		reported.current = state.error;
		onErrorRef.current?.(state.error);
		continueRender(loadHandle);
	}, [state, loadHandle]);

	const image = state.status === "loaded" ? state.image : null;
	// undefined: not loaded; null: nothing to show (cleared after the last frame).
	const index = image
		? animatedImageFrameAt(image.timeline, animatedImageTimeAt(frame, fps), loopBehavior)
		: undefined;

	// Draws the frame of the current time. A frame not in the cache holds the render while it is
	// decoded; in the Player it is drawn as soon as it is ready.
	useLayoutEffect(() => {
		const canvas = canvasRef.current;
		if (!image || index === undefined || !canvas) return;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("<AnimatedImage>: the canvas has no 2D context.");
		const draw = (bitmap: ImageBitmap | null) => {
			context.clearRect(0, 0, canvas.width, canvas.height);
			if (!bitmap) return;
			const target = animatedImageFitRect(
				fit,
				image.width,
				image.height,
				canvas.width,
				canvas.height,
			);
			context.drawImage(bitmap, target.x, target.y, target.width, target.height);
		};
		if (index === null) {
			draw(null);
			continueRender(loadHandle);
			return;
		}
		const cached = image.frame(index);
		if (cached) {
			draw(cached);
			continueRender(loadHandle);
			return;
		}
		let active = true;
		const handle = delayRender(`Decoding frame ${index} of <AnimatedImage> with src=${src}`);
		const request = (attempt: number): void => {
			image.load(index).then(
				(bitmap) => {
					if (!active) return;
					// A bitmap evicted by another decode before this callback ran is closed (0 wide).
					if (bitmap.width === 0 && attempt < 3) {
						request(attempt + 1);
						return;
					}
					draw(bitmap);
					continueRender(handle);
					continueRender(loadHandle);
				},
				(reason: unknown) => {
					if (!active || isReleased(reason)) return;
					setState({ status: "failed", error: failure(src, reason) });
					continueRender(handle);
				},
			);
		};
		request(0);
		return () => {
			active = false;
			continueRender(handle);
		};
	});

	const clip = cropClipPath(
		{ left: cropLeft, right: cropRight, top: cropTop, bottom: cropBottom },
		style,
	);
	let finalStyle: CSSProperties | undefined = clip ? { ...style, clipPath: clip } : style;
	if (premounted) finalStyle = { ...finalStyle, ...HIDDEN, ...styleWhilePremounted };
	else if (postmounted) finalStyle = { ...finalStyle, ...HIDDEN, ...styleWhilePostmounted };
	const canvasWidth = width ?? image?.width;
	const canvasHeight = height ?? image?.height;
	return (
		<canvas
			{...canvasAttributes}
			ref={setRef}
			{...(canvasWidth !== undefined ? { width: canvasWidth } : {})}
			{...(canvasHeight !== undefined ? { height: canvasHeight } : {})}
			{...(finalStyle ? { style: finalStyle } : {})}
		/>
	);
});

/**
 * Shows an animated GIF, APNG, WebP or AVIF in sync with the timeline. The file is decoded with
 * the browser's `ImageDecoder` (Chrome and Firefox) and every frame draws onto a canvas the image
 * frame whose display interval contains the current time; a frame with a duration of 0 lasts
 * 100 ms. Rendering waits until that frame is decoded. `playbackRate` changes the speed and
 * `loopBehavior` says what happens after the last frame. Accepts the `<Sequence>` timing props;
 * the ref is the `<canvas>`. A file that cannot be loaded fails the render unless `onError` is
 * given.
 */
export const AnimatedImage = forwardRef<HTMLCanvasElement, AnimatedImageProps>(
	function AnimatedImage(props, ref) {
		if (props.effects !== undefined && props.effects !== null && props.effects.length > 0) {
			throw new Error(
				"<AnimatedImage>: the effects prop is not supported by Motio. Remove it or draw the effect over the image.",
			);
		}
		const timing: SequenceTimingProps = {};
		const inner: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(props)) {
			if (key === "effects" || key === "effectsOutputSize") continue;
			if ((TIMING_KEYS as readonly string[]).includes(key)) {
				if (value !== undefined) (timing as Record<string, unknown>)[key] = value;
			} else {
				inner[key] = value;
			}
		}
		return (
			<SequenceBase
				name="<AnimatedImage>"
				showInTimeline={false}
				{...timing}
				layout="none"
				componentName="AnimatedImage"
			>
				<AnimatedImageCanvas key={props.src} {...(inner as unknown as CanvasProps)} ref={ref} />
			</SequenceBase>
		);
	},
);
