import { useBufferState, useRemotionEnvironment } from "@motiojs/core";
import { useMediaPlayback } from "@motiojs/core/internals";
import {
	type CSSProperties,
	type ForwardedRef,
	type ReactNode,
	useCallback,
	useLayoutEffect,
	useState,
} from "react";
import { MediaTimeline, type MediaTimelineProps } from "./media-timeline.js";
import { useMediaPosition } from "./position.js";
import { assignRef } from "./render-errors.js";
import type { ResolvedTrim } from "./timing.js";
import { useAudioIntent } from "./use-audio-intent.js";
import { DEFAULT_TIME_SHIFT_S, useMediaSync } from "./use-media-sync.js";
import { evaluateVolume, type LoopVolumeCurveBehavior, type VolumeProp } from "./volume.js";

/** Normalised props of `AudioBase`, built by `<Html5Audio>` and the `@remotion/media` `<Audio>`. */
export interface AudioBaseProps {
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
	/** Borrow an element from the Player's shared audio tags when it has some. */
	useSharedAudioTag: boolean;
	style: CSSProperties | undefined;
	crossOrigin: "anonymous" | "use-credentials" | "" | undefined;
	native: Record<string, unknown>;
	sequence: Omit<
		MediaTimelineProps,
		"src" | "trim" | "playbackRate" | "loop" | "isRendering" | "componentName" | "children"
	>;
	forwardedRef: ForwardedRef<HTMLAudioElement>;
}

function AudioInner(props: AudioBaseProps & { looping: boolean }): ReactNode {
	const { componentName, src, trim, playbackRate, looping, forwardedRef } = props;
	const env = useRemotionEnvironment();
	const playback = useMediaPlayback();
	const buffer = useBufferState();
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

	const pool = !rendering && props.useSharedAudioTag ? (playback?.sharedAudio ?? null) : null;
	const [element, setElement] = useState<HTMLAudioElement | null>(null);
	useLayoutEffect(() => {
		if (!pool || pool.size === 0) return;
		const el = pool.acquire(`<${componentName}> src=${src}`);
		setElement(el);
		assignRef(forwardedRef, el);
		return () => {
			assignRef(forwardedRef, null);
			setElement(null);
			pool.release(el);
		};
	}, [pool, componentName, src, forwardedRef]);
	useLayoutEffect(() => {
		if (!pool || !element) return;
		if (element.getAttribute("src") !== src) element.src = src;
		if (props.crossOrigin !== undefined) element.crossOrigin = props.crossOrigin;
	}, [pool, element, src, props.crossOrigin]);

	const audioRef = useCallback(
		(el: HTMLAudioElement | null) => {
			setElement(el);
			assignRef(forwardedRef, el);
		},
		[forwardedRef],
	);

	useMediaSync(element, {
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
		component: componentName,
	});

	if (pool && pool.size > 0) return null;
	return (
		<audio
			{...props.native}
			ref={audioRef}
			src={src}
			style={props.style}
			preload={rendering ? "none" : "auto"}
			muted={rendering || props.muted}
			loop={!rendering && props.loop}
			crossOrigin={props.crossOrigin}
		/>
	);
}

/** The implementation behind `<Html5Audio>` and the `@remotion/media` `<Audio>`. */
export function AudioBase(props: AudioBaseProps): ReactNode {
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
			{(looping) => <AudioInner {...props} looping={looping} />}
		</MediaTimeline>
	);
}
