import { type BufferState, useBufferState, useRemotionEnvironment } from "@motiojs/core";
import { type MediaPlayback, useMediaPlayback } from "@motiojs/core/internals";
import {
	type CSSProperties,
	type ForwardedRef,
	type ReactNode,
	useCallback,
	useEffect,
	useState,
} from "react";
import { mountedStyle } from "./common.js";
import { delayOptions, MediaTimeline, type MediaTimelineProps } from "./media-timeline.js";
import { type MediaPosition, useMediaPosition } from "./position.js";
import { assignRef } from "./render-errors.js";
import {
	type ObjectFit,
	useCanvasFrame,
	useExtractedImage,
	useSeekedVideo,
} from "./render-frame.js";
import type { ResolvedTrim } from "./timing.js";
import { useAudioIntent } from "./use-audio-intent.js";
import { DEFAULT_TIME_SHIFT_S, useMediaSync } from "./use-media-sync.js";
import { evaluateVolume, type LoopVolumeCurveBehavior, type VolumeProp } from "./volume.js";

/** Which component a `VideoBase` implements. */
export type VideoKind = "html5" | "offthread" | "media";

/** Normalised props of `VideoBase`, built by each public video component. */
export interface VideoBaseProps {
	kind: VideoKind;
	componentName: string;
	src: string;
	trim: ResolvedTrim;
	playbackRate: number;
	loop: boolean;
	volume: VolumeProp | undefined;
	loopVolumeCurveBehavior: LoopVolumeCurveBehavior;
	muted: boolean;
	toneFrequency: number;
	preservePitch: boolean;
	audioStreamIndex: number | null;
	acceptableTimeShiftInSeconds: number | undefined;
	pauseWhenBuffering: boolean;
	onAutoPlayError: (() => void) | undefined;
	style: CSSProperties | undefined;
	className: string | undefined;
	/** Render-path failures; the component decides whether to fail the render. */
	onRenderError: (error: Error) => void;
	/** Called with each new frame (`onVideoFrame`). */
	onVideoFrame: ((frame: CanvasImageSource) => void) | undefined;
	transparent: boolean;
	objectFit: ObjectFit;
	headless: boolean;
	crossOrigin: "anonymous" | "use-credentials" | "" | undefined;
	/** Native attributes forwarded to the `<video>` element. */
	native: Record<string, unknown>;
	sequence: Omit<
		MediaTimelineProps,
		"src" | "trim" | "playbackRate" | "loop" | "isRendering" | "componentName" | "children"
	>;
}

/**
 * Calls `onVideoFrame` with the playing `<video>` in a preview, on every presented frame where
 * `requestVideoFrameCallback` exists, else once per render.
 */
function usePreviewFrames(
	video: HTMLVideoElement | null,
	enabled: boolean,
	onVideoFrame: ((frame: CanvasImageSource) => void) | undefined,
	position: MediaPosition,
): void {
	// Without requestVideoFrameCallback, each new position calls `onVideoFrame` once.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useEffect(() => {
		if (!enabled || !video || !onVideoFrame) return;
		if (typeof video.requestVideoFrameCallback !== "function") {
			onVideoFrame(video);
			return;
		}
		let id = 0;
		const tick = () => {
			onVideoFrame(video);
			id = video.requestVideoFrameCallback(tick);
		};
		onVideoFrame(video);
		id = video.requestVideoFrameCallback(tick);
		return () => video.cancelVideoFrameCallback(id);
	}, [enabled, video, onVideoFrame, position.time]);
}

interface InnerProps extends VideoBaseProps {
	looping: boolean;
	forwardedRef: ForwardedRef<HTMLVideoElement | HTMLImageElement | HTMLCanvasElement>;
}

function VideoInner(props: InnerProps): ReactNode {
	const { kind, componentName, src, trim, playbackRate, looping } = props;
	const env = useRemotionEnvironment();
	const playback: MediaPlayback | null = useMediaPlayback();
	const buffer: BufferState = useBufferState();
	const position = useMediaPosition(trim.trimBefore, playbackRate, looping, componentName);
	const rendering = env.isRendering;
	const volume = evaluateVolume(
		props.volume,
		{ inIteration: position.sinceStart, total: position.sinceStartTotal },
		props.loopVolumeCurveBehavior,
		componentName,
	);
	useAudioIntent({
		enabled: rendering,
		src,
		position,
		volume,
		muted: props.muted,
		toneFrequency: props.toneFrequency,
		preservePitch: props.preservePitch,
		audioStreamIndex: props.audioStreamIndex,
	});

	const [video, setVideo] = useState<HTMLVideoElement | null>(null);
	const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
	const { forwardedRef } = props;
	const videoRef = useCallback(
		(el: HTMLVideoElement | null) => {
			setVideo(el);
			assignRef(forwardedRef, el);
		},
		[forwardedRef],
	);
	const canvasRef = useCallback(
		(el: HTMLCanvasElement | null) => {
			setCanvas(el);
			assignRef(forwardedRef, el);
		},
		[forwardedRef],
	);
	const imgRef = useCallback(
		(el: HTMLImageElement | null) => assignRef(forwardedRef, el),
		[forwardedRef],
	);

	useMediaSync(video, {
		enabled: !rendering,
		src,
		time: position.time,
		rate: position.rate,
		volume,
		muted: props.muted,
		playback,
		acceptableTimeShiftInSeconds: props.acceptableTimeShiftInSeconds ?? DEFAULT_TIME_SHIFT_S,
		preservePitch: props.preservePitch,
		pauseWhenBuffering: props.pauseWhenBuffering,
		buffer,
		onAutoPlayError: props.onAutoPlayError,
		component: componentName,
	});
	usePreviewFrames(video, !rendering, props.onVideoFrame, position);

	const delay = delayOptions(props.sequence);
	const renderOptions = {
		src,
		time: position.time,
		component: componentName,
		delay,
		onError: props.onRenderError,
	};
	useSeekedVideo(video, {
		...renderOptions,
		enabled: rendering && kind === "html5",
		onShown: props.onVideoFrame,
	});
	const image = useExtractedImage({
		...renderOptions,
		enabled: rendering && kind === "offthread",
		transparent: props.transparent,
		onLoaded: props.onVideoFrame,
	});
	useCanvasFrame(canvas, {
		...renderOptions,
		enabled: rendering && kind === "media",
		headless: props.headless,
		onFrame: props.onVideoFrame,
	});

	const style = mountedStyle(props.style, position, props.sequence);
	if (rendering && kind === "offthread") {
		return (
			// biome-ignore lint/a11y/useAltText: a video frame; `alt` is forwarded when given.
			<img
				{...props.native}
				ref={imgRef}
				src={image.url ?? undefined}
				style={style}
				className={props.className}
				crossOrigin="anonymous"
				onLoad={(e) => image.onLoad(e.currentTarget)}
				onError={image.onError}
			/>
		);
	}
	if (rendering && kind === "media") {
		if (props.headless) return null;
		return (
			<canvas
				ref={canvasRef}
				style={{ objectFit: props.objectFit, ...style }}
				className={props.className}
			/>
		);
	}
	const previewStyle =
		kind === "media" && !rendering ? { objectFit: props.objectFit, ...style } : style;
	return (
		<video
			{...props.native}
			ref={videoRef}
			src={src}
			style={previewStyle}
			className={props.className}
			muted={rendering || props.muted}
			playsInline
			preload="auto"
			loop={!rendering && props.loop}
			crossOrigin={props.crossOrigin}
		/>
	);
}

/** The implementation behind `<Html5Video>`, `<OffthreadVideo>` and the `@remotion/media` `<Video>`. */
export function VideoBase(
	props: VideoBaseProps & {
		forwardedRef: ForwardedRef<HTMLVideoElement | HTMLImageElement | HTMLCanvasElement>;
	},
): ReactNode {
	const env = useRemotionEnvironment();
	return (
		<MediaTimeline
			{...props.sequence}
			src={props.src}
			trim={props.trim}
			playbackRate={props.playbackRate}
			loop={props.loop}
			isRendering={env.isRendering}
			componentName={props.componentName}
		>
			{(looping) => <VideoInner {...props} looping={looping} />}
		</MediaTimeline>
	);
}
