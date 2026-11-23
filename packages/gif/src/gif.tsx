import { continueRender, delayRender, useCurrentFrame, useVideoConfig } from "@motiojs/core";
import {
	cropClipPath,
	SequenceBase,
	type SequenceTimingProps,
	useTimeline,
} from "@motiojs/core/internals";
import {
	type CSSProperties,
	type ForwardedRef,
	forwardRef,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import type { DecodedGif } from "./decode.js";
import { acquireGif } from "./load.js";
import { type GifLoopBehavior, gifFrameIndex } from "./timing.js";

/** How the GIF fills the canvas. */
export type GifFillMode = "fill" | "contain" | "cover";

/** What `onLoad` receives once the GIF is decoded. */
export interface GifLoadInfo {
	width: number;
	height: number;
	loaded: true;
	/** Display time of each frame in milliseconds (a delay of 0 is 100 ms). */
	delays: number[];
	/** Every frame, composed onto the full canvas. */
	frames: ImageData[];
}

/** Props of `<Gif>`. */
export interface GifProps {
	/** URL of the GIF, served as `image/gif` (with CORS from another origin). */
	src: string;
	/** Width of the canvas in pixels. Default: the canvas's laid-out width. */
	width?: number;
	/** Height of the canvas in pixels. Default: the canvas's laid-out height. */
	height?: number;
	/** `"fill"` (default) stretches, `"contain"` fits inside, `"cover"` fills and crops. */
	fit?: GifFillMode;
	/** Not supported by Motio yet: effects need `@remotion/effects`. Must be empty or absent. */
	effects?: readonly unknown[];
	/** Called once the GIF is downloaded and decoded. */
	onLoad?: (info: GifLoadInfo) => void;
	/** Called when loading fails; the error is then not thrown and nothing is drawn. */
	onError?: (error: Error) => void;
	/** Styles of the canvas. Use `width` and `height` for its size. */
	style?: CSSProperties;
	/** Crop ratios between 0 and 1, applied to the canvas with a clip path. */
	cropLeft?: number;
	cropRight?: number;
	cropTop?: number;
	cropBottom?: number;
	/** `"loop"` (default), `"pause-after-finish"` or `"unmount-after-finish"`. */
	loopBehavior?: GifLoopBehavior;
	/** Speed: 2 plays twice as fast. Positive. Default 1. */
	playbackRate?: number;
	/** Timeout of the readiness handle held while loading. Default 30 s. */
	delayRenderTimeoutInMilliseconds?: number;
	/** Passed to `fetch()` (headers, credentials); a `signal` has no effect. */
	requestInit?: RequestInit;
	/** Frame of the parent at which the GIF starts. Default 0. */
	from?: number;
	/** How many frames the GIF stays mounted. Default `Infinity`. */
	durationInFrames?: number;
	/** Frames of the GIF's timeline skipped at its start. Default 0. */
	trimBefore?: number;
	/** Do not render the GIF. */
	hidden?: boolean;
	/** Label in an editor timeline. Default `"<Gif>"`. */
	name?: string;
	/** Whether an editor timeline shows the GIF. Default `false`. */
	showInTimeline?: boolean;
	/** Mount this many frames before `from`, hidden and on the first frame (Player only). */
	premountFor?: number;
	/** Stay mounted this many frames after the end, hidden and on the last frame (Player only). */
	postmountFor?: number;
	/** Styles of the canvas while premounted, over `display: none; pointer-events: none`. */
	styleWhilePremounted?: CSSProperties;
	/** Styles of the canvas while postmounted, over `display: none; pointer-events: none`. */
	styleWhilePostmounted?: CSSProperties;
}

const TIMING_KEYS = [
	"from",
	"durationInFrames",
	"trimBefore",
	"hidden",
	"name",
	"showInTimeline",
	"premountFor",
	"postmountFor",
] as const;

const HIDDEN: CSSProperties = { display: "none", pointerEvents: "none" };

/** Where the GIF goes on a canvas of the given size, for a fit mode. */
export function fitRect(
	fit: string,
	gifWidth: number,
	gifHeight: number,
	canvasWidth: number,
	canvasHeight: number,
): { x: number; y: number; width: number; height: number } {
	if (fit === "fill") return { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
	if (fit !== "contain" && fit !== "cover") {
		throw new Error(`<Gif>: fit is ${JSON.stringify(fit)}: use "fill", "contain" or "cover".`);
	}
	const ratio = (fit === "contain" ? Math.min : Math.max)(
		canvasWidth / gifWidth,
		canvasHeight / gifHeight,
	);
	const width = gifWidth * ratio;
	const height = gifHeight * ratio;
	return { x: (canvasWidth - width) / 2, y: (canvasHeight - height) / 2, width, height };
}

type Loaded = { gif: DecodedGif; images: ImageData[]; source: HTMLCanvasElement };
type LoadState = { status: "loading" } | { status: "loaded"; value: Loaded } | { status: "failed" };

/**
 * The canvas size the layout gives the element, in CSS pixels before any transform: the bounding
 * box (border box, transformed) divided by the scale that maps the computed content width onto it.
 * `null` while the canvas is not laid out (`display: none`).
 */
function measure(canvas: HTMLCanvasElement): { width: number; height: number } | null {
	const rect = canvas.getBoundingClientRect();
	const scale = rect.width / Number.parseFloat(getComputedStyle(canvas).width);
	if (!Number.isFinite(scale) || scale <= 0) return null;
	return { width: rect.width / scale, height: rect.height / scale };
}

type CanvasProps = Omit<GifProps, (typeof TIMING_KEYS)[number] | "playbackRate" | "effects">;

const GifCanvas = forwardRef(function GifCanvas(
	props: CanvasProps,
	forwarded: ForwardedRef<HTMLCanvasElement>,
) {
	const {
		src,
		width,
		height,
		fit = "fill",
		onLoad,
		onError,
		style,
		cropLeft = 0,
		cropRight = 0,
		cropTop = 0,
		cropBottom = 0,
		loopBehavior = "loop",
		delayRenderTimeoutInMilliseconds,
		requestInit,
		styleWhilePremounted,
		styleWhilePostmounted,
	} = props;
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const { premounted, postmounted } = useTimeline("<Gif>");
	const [handle] = useState(() =>
		delayRender(
			`Loading <Gif> with src=${src}`,
			delayRenderTimeoutInMilliseconds === undefined
				? undefined
				: { timeoutInMilliseconds: delayRenderTimeoutInMilliseconds },
		),
	);
	const [state, setState] = useState<LoadState>({ status: "loading" });
	const [error, setError] = useState<unknown>(null);
	const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const callbacks = useRef({ onLoad, onError });
	callbacks.current = { onLoad, onError };

	const setRef = useCallback(
		(node: HTMLCanvasElement | null) => {
			canvasRef.current = node;
			if (typeof forwarded === "function") forwarded(node);
			else if (forwarded) forwarded.current = node;
		},
		[forwarded],
	);

	// The component is keyed by src, so this runs once per GIF; requestInit is read once per src.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useEffect(() => {
		let active = true;
		const { promise, release } = acquireGif(src, requestInit ? { requestInit } : {});
		promise.then(
			(gif) => {
				if (!active) return;
				const images = gif.frames.map((data) => new ImageData(data, gif.width, gif.height));
				const source = document.createElement("canvas");
				source.width = gif.width;
				source.height = gif.height;
				setState({ status: "loaded", value: { gif, images, source } });
				callbacks.current.onLoad?.({
					width: gif.width,
					height: gif.height,
					loaded: true,
					delays: gif.delays,
					frames: images,
				});
			},
			(reason: unknown) => {
				if (!active) return;
				const { onError: handler } = callbacks.current;
				if (handler) {
					setState({ status: "failed" });
					handler(new Error(loadFailure(src, reason), { cause: reason }));
					continueRender(handle);
				} else {
					setError(reason);
				}
			},
		);
		return () => {
			active = false;
			release();
			continueRender(handle);
		};
	}, [src, handle]);

	if (error !== null) {
		throw new Error(
			`${loadFailure(src, error)} Pass onError to handle a failed load without failing the render.`,
			{ cause: error },
		);
	}

	const loaded = state.status === "loaded" ? state.value : null;
	const index = loaded ? gifFrameIndex((frame / fps) * 1000, loaded.gif.delays, loopBehavior) : 0;

	// Size from the layout when not given, then draw the frame of the current time.
	useLayoutEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			if (loaded) continueRender(handle);
			return;
		}
		const size = measure(canvas);
		if ((width === undefined || height === undefined) && size) {
			if (!measured || measured.width !== size.width || measured.height !== size.height) {
				setMeasured(size);
				return;
			}
		}
		if (!loaded) return;
		if (size && index !== null && loaded.images.length > 0) {
			const context = canvas.getContext("2d");
			const sourceContext = loaded.source.getContext("2d");
			if (!context || !sourceContext) throw new Error("<Gif>: the canvas has no 2D context.");
			sourceContext.putImageData(loaded.images[index] as ImageData, 0, 0);
			const target = fitRect(fit, loaded.gif.width, loaded.gif.height, canvas.width, canvas.height);
			context.clearRect(0, 0, canvas.width, canvas.height);
			context.drawImage(loaded.source, target.x, target.y, target.width, target.height);
		}
		continueRender(handle);
	});

	if (index === null) return null;

	const clip = cropClipPath(
		{ left: cropLeft, right: cropRight, top: cropTop, bottom: cropBottom },
		style,
	);
	let finalStyle: CSSProperties | undefined = clip ? { ...style, clipPath: clip } : style;
	if (premounted) finalStyle = { ...finalStyle, ...HIDDEN, ...styleWhilePremounted };
	else if (postmounted) finalStyle = { ...finalStyle, ...HIDDEN, ...styleWhilePostmounted };
	const canvasWidth = width ?? measured?.width;
	const canvasHeight = height ?? measured?.height;
	return (
		<canvas
			ref={setRef}
			{...(canvasWidth !== undefined ? { width: canvasWidth } : {})}
			{...(canvasHeight !== undefined ? { height: canvasHeight } : {})}
			{...(finalStyle ? { style: finalStyle } : {})}
		/>
	);
});

const loadFailure = (src: string, reason: unknown) =>
	`<Gif> could not load ${src}: ${reason instanceof Error ? reason.message : String(reason)}`;

function validatePlaybackRate(playbackRate: unknown): void {
	if (
		playbackRate !== undefined &&
		(typeof playbackRate !== "number" || !Number.isFinite(playbackRate) || playbackRate <= 0)
	) {
		throw new TypeError(
			`<Gif>: playbackRate is ${String(playbackRate)}: pass a positive finite number.`,
		);
	}
}

/**
 * Shows a GIF in sync with the timeline: the GIF is downloaded and decoded (in JavaScript, so it
 * works in every browser), and each frame draws onto a canvas the GIF frame of the current time,
 * never the browser's own animation. Rendering waits until the GIF is loaded. `playbackRate`
 * changes the speed; `loopBehavior` says what happens after the last frame. Accepts the
 * `<Sequence>` timing props; the ref is the `<canvas>`.
 */
export const Gif = forwardRef<HTMLCanvasElement, GifProps>(function Gif(props, ref) {
	validatePlaybackRate(props.playbackRate);
	if (props.effects !== undefined && props.effects.length > 0) {
		throw new Error(
			"<Gif>: the effects prop needs @remotion/effects, which Motio does not provide yet. Remove it or draw the effect over the GIF.",
		);
	}
	const timing: SequenceTimingProps = {};
	const inner: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(props)) {
		if (key === "effects") continue;
		if ((TIMING_KEYS as readonly string[]).includes(key) || key === "playbackRate") {
			if (value !== undefined) (timing as Record<string, unknown>)[key] = value;
		} else {
			inner[key] = value;
		}
	}
	return (
		<SequenceBase name="<Gif>" showInTimeline={false} {...timing} layout="none" componentName="Gif">
			<GifCanvas key={props.src} {...(inner as unknown as CanvasProps)} ref={ref} />
		</SequenceBase>
	);
});
