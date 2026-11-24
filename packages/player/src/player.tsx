import type { MediaPlayback } from "@motiojs/core/internals";
import {
	type ForwardedRef,
	forwardRef,
	type ReactElement,
	type KeyboardEvent as ReactKeyboardEvent,
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
	type Ref,
	useCallback,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import {
	CanvasErrorBoundary,
	CompositionTree,
	INTERNAL_CLASS_NAME,
	impliedSize,
	LoadingBoundary,
	makeVideoConfig,
	outerStyle,
	placeCanvas,
	ScaledCanvas,
	useComponentKey,
	useCompositionComponent,
	useElementSize,
	usePlayerMount,
} from "./canvas.js";
import { Controls, DEFAULT_PLAYBACK_RATES } from "./controls.js";
import { PlayerEmitter } from "./emitter.js";
import {
	currentFullscreenElement,
	enterFullscreen,
	isFullscreenSupported,
	leaveFullscreen,
	onFullscreenChange,
} from "./fullscreen.js";
import { useMediaSession } from "./media-session.js";
import { type PlaybackOptions, PlaybackStore } from "./playback-store.js";
import { SharedAudioTags } from "./shared-audio.js";
import type { PlayerEventTypes, PlayerProps, PlayerRef } from "./types.js";
import { assertUnchanged, validateCanvasProps, validatePlayerProps } from "./validate.js";
import { DEFAULT_VOLUME_KEY, persistVolume, readPersistedVolume } from "./volume-persistence.js";

const EMPTY_PROPS: Record<string, unknown> = {};
const DEFAULT_MEDIA_BEHAVIOR = { mode: "prevent-media-session" } as const;
/** How long a single click waits for a second one when `doubleClickToFullscreen` is on. */
const DOUBLE_CLICK_MS = 200;
const INITIAL_CONTROLS_MS = 2000;
const POINTER_IDLE_MS = 3000;

/** `true` after `value` stayed true for `delayMs`; false as soon as it turns false. */
function useDelayedFlag(value: boolean, delayMs: number): boolean {
	const [delayed, setDelayed] = useState(false);
	useEffect(() => {
		if (!value || delayMs === 0) {
			setDelayed(false);
			return;
		}
		const id = setTimeout(() => setDelayed(true), delayMs);
		return () => clearTimeout(id);
	}, [value, delayMs]);
	return value && (delayMs === 0 || delayed);
}

/** Whether the default controls are visible, following the hover and timing props. */
function useControlsVisibility(
	alwaysShow: boolean,
	initiallyShow: boolean | number,
	hideWhenIdle: boolean | number,
	scrubbing: boolean,
) {
	const initialMs =
		initiallyShow === true ? INITIAL_CONTROLS_MS : initiallyShow === false ? 0 : initiallyShow;
	const idleMs =
		hideWhenIdle === true ? POINTER_IDLE_MS : hideWhenIdle === false ? 0 : hideWhenIdle;
	const [initial, setInitial] = useState(initialMs > 0);
	const [hovered, setHovered] = useState(false);
	const [active, setActive] = useState(false);
	const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (initialMs <= 0) return;
		const id = setTimeout(() => setInitial(false), initialMs);
		return () => clearTimeout(id);
	}, [initialMs]);

	const clearIdle = () => {
		if (idleTimer.current !== null) clearTimeout(idleTimer.current);
		idleTimer.current = null;
	};
	useEffect(
		() => () => {
			if (idleTimer.current !== null) clearTimeout(idleTimer.current);
		},
		[],
	);

	const onPointerMove = () => {
		setHovered(true);
		setActive(true);
		clearIdle();
		if (idleMs > 0) idleTimer.current = setTimeout(() => setActive(false), idleMs);
	};
	const onPointerLeave = () => {
		setHovered(false);
		setActive(false);
		clearIdle();
	};
	const visible = alwaysShow || initial || scrubbing || (hovered && (idleMs === 0 ? true : active));
	return { visible, onPointerMove, onPointerEnter: onPointerMove, onPointerLeave };
}

function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName;
	return (
		tag === "INPUT" ||
		tag === "TEXTAREA" ||
		tag === "SELECT" ||
		tag === "BUTTON" ||
		target.isContentEditable
	);
}

function PlayerInner<Props extends Record<string, unknown>>(
	props: PlayerProps<unknown, Props>,
	ref: ForwardedRef<PlayerRef>,
): ReactNode {
	validateCanvasProps("Player", props);
	validatePlayerProps(props);
	const {
		durationInFrames,
		fps,
		compositionWidth,
		compositionHeight,
		loop = false,
		autoPlay = false,
		controls = false,
		showVolumeControls = true,
		allowFullscreen = true,
		clickToPlay = controls,
		doubleClickToFullscreen = false,
		spaceKeyToPlayOrPause = true,
		moveToBeginningWhenEnded = true,
		initialFrame = 0,
		playbackRate = 1,
		inFrame = null,
		outFrame = null,
		numberOfSharedAudioTags = 5,
		sampleRate = 48000,
		bufferStateDelayInMilliseconds = 300,
		initiallyShowControls = true,
		alwaysShowControls = false,
		hideControlsWhenPointerDoesntMove = true,
		showPlaybackRateControl = false,
		initiallyMuted = false,
		initialVolume,
		volumePersistenceKey = DEFAULT_VOLUME_KEY,
		browserMediaControlsBehavior = DEFAULT_MEDIA_BEHAVIOR,
		renderPoster,
		showPosterWhenUnplayed = false,
		showPosterWhenPaused = false,
		showPosterWhenEnded = false,
		showPosterWhenBuffering = false,
		showPosterWhenBufferingAndPaused = false,
		posterFillMode = "player-size",
		overflowVisible = false,
		noSuspense = false,
		style,
		className,
		overrideInternalClassName,
		errorFallback,
		renderLoading,
		_experimentalKeepAudioContextAlive = false,
	} = props;

	// Props fixed at mount.
	const fixed = useRef({
		initialFrame,
		numberOfSharedAudioTags,
		sampleRate,
		_experimentalKeepAudioContextAlive,
	});
	assertUnchanged("initialFrame", fixed.current.initialFrame, initialFrame);
	assertUnchanged(
		"numberOfSharedAudioTags",
		fixed.current.numberOfSharedAudioTags,
		numberOfSharedAudioTags,
	);
	assertUnchanged("sampleRate", fixed.current.sampleRate, sampleRate);
	assertUnchanged(
		"_experimentalKeepAudioContextAlive",
		fixed.current._experimentalKeepAudioContextAlive,
		_experimentalKeepAudioContextAlive,
	);

	// The playback rate menu overrides the prop until the prop changes.
	const [rateOverride, setRateOverride] = useState<{ prop: number; rate: number } | null>(null);
	const effectiveRate =
		rateOverride && rateOverride.prop === playbackRate ? rateOverride.rate : playbackRate;

	const [emitter] = useState(() => new PlayerEmitter<PlayerEventTypes>());
	const options: PlaybackOptions = {
		fps,
		durationInFrames,
		inFrame,
		outFrame,
		loop,
		playbackRate: effectiveRate,
		moveToBeginningWhenEnded,
	};
	const [store] = useState(
		() =>
			new PlaybackStore(
				options,
				{
					frame: initialFrame,
					volume: initialVolume ?? readPersistedVolume(volumePersistenceKey) ?? 1,
					muted: initiallyMuted,
				},
				emitter,
			),
	);
	useLayoutEffect(() => {
		store.setOptions(options);
	});

	const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
	const [sharedAudio] = useState(() =>
		numberOfSharedAudioTags > 0 && typeof document !== "undefined"
			? new SharedAudioTags(numberOfSharedAudioTags)
			: null,
	);
	const playing = snap.playing && !snap.buffering;
	const playback = useMemo<MediaPlayback>(
		() => ({
			playing,
			playbackRate: effectiveRate,
			volume: snap.volume,
			muted: snap.muted,
			sharedAudio,
		}),
		[playing, effectiveRate, snap.volume, snap.muted, sharedAudio],
	);
	// Called on every play request: within a user gesture it unlocks the shared audio tags.
	const unlockAudio = useCallback(() => sharedAudio?.unlock(), [sharedAudio]);
	const mounted = usePlayerMount();
	const container = useRef<HTMLDivElement | null>(null);
	const size = useElementSize(container, impliedSize(style, compositionWidth, compositionHeight));
	const placement = placeCanvas(size, compositionWidth, compositionHeight);
	const scaleRef = useRef(placement.scale);
	scaleRef.current = placement.scale;

	// The media the clock waits for at play: elements in the composition and the lent shared tags.
	useEffect(() => {
		store.setMediaElements(() => {
			const inTree = container.current?.querySelectorAll<HTMLMediaElement>("video, audio") ?? [];
			return [...inTree, ...(sharedAudio?.lent() ?? [])];
		});
	}, [store, sharedAudio]);

	// Store lifecycle, autoplay and volume persistence.
	useEffect(() => {
		store.attach();
		return () => store.detach();
	}, [store]);
	// Autoplay applies on mount only, as in Remotion.
	const autoPlayAtMount = useRef(autoPlay);
	useEffect(() => {
		if (autoPlayAtMount.current) store.play();
	}, [store]);
	useEffect(() => {
		if (initialVolume !== undefined) return;
		const listener = ({ detail }: { detail: { volume: number } }) =>
			persistVolume(volumePersistenceKey, detail.volume);
		emitter.addEventListener("volumechange", listener);
		return () => emitter.removeEventListener("volumechange", listener);
	}, [emitter, initialVolume, volumePersistenceKey]);

	// Scale changes.
	const lastScale = useRef(placement.scale);
	useEffect(() => {
		if (lastScale.current === placement.scale) return;
		lastScale.current = placement.scale;
		emitter.dispatch("scalechange", { scale: placement.scale });
	}, [emitter, placement.scale]);

	// Fullscreen.
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [fullscreenSupported, setFullscreenSupported] = useState(false);
	useEffect(() => {
		setFullscreenSupported(isFullscreenSupported());
		return onFullscreenChange(() => {
			const now = container.current !== null && currentFullscreenElement() === container.current;
			setIsFullscreen((prev) => {
				if (prev !== now) emitter.dispatch("fullscreenchange", { isFullscreen: now });
				return now;
			});
		});
	}, [emitter]);
	const requestFullscreen = useCallback(() => {
		if (!allowFullscreen) {
			throw new Error("requestFullscreen() was called but the Player has allowFullscreen={false}.");
		}
		if (!isFullscreenSupported()) {
			throw new Error("requestFullscreen() was called but this browser does not allow fullscreen.");
		}
		const el = container.current;
		if (!el) throw new Error("requestFullscreen() was called before the Player mounted.");
		enterFullscreen(el);
	}, [allowFullscreen]);
	const exitFullscreen = useCallback(() => {
		if (container.current !== null && currentFullscreenElement() === container.current) {
			leaveFullscreen();
		}
	}, []);

	useMediaSession(store, browserMediaControlsBehavior, fps, durationInFrames, effectiveRate);

	useImperativeHandle(
		ref,
		(): PlayerRef => ({
			play: () => {
				unlockAudio();
				store.play();
			},
			pause: () => store.pause(),
			toggle: () => {
				unlockAudio();
				store.toggle();
			},
			pauseAndReturnToPlayStart: () => store.pauseAndReturnToPlayStart(),
			seekTo: (frame) => store.seekTo(frame),
			getCurrentFrame: () => store.getSnapshot().frame,
			isPlaying: () => store.getSnapshot().playing,
			getContainerNode: () => container.current,
			mute: () => store.mute(),
			unmute: () => store.unmute(),
			isMuted: () => store.isMuted(),
			getVolume: () => store.getVolume(),
			setVolume: (v) => store.setVolume(v),
			isFullscreen: () =>
				container.current !== null && currentFullscreenElement() === container.current,
			requestFullscreen,
			exitFullscreen,
			getScale: () => scaleRef.current,
			addEventListener: (name, cb) => emitter.addEventListener(name, cb),
			removeEventListener: (name, cb) => emitter.removeEventListener(name, cb),
		}),
		[store, emitter, requestFullscreen, exitFullscreen, unlockAudio],
	);

	// Clicks: play/pause on click, fullscreen on double click.
	const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (clickTimer.current !== null) clearTimeout(clickTimer.current);
		},
		[],
	);
	const toggleFullscreen = useCallback(() => {
		if (container.current !== null && currentFullscreenElement() === container.current) {
			leaveFullscreen();
		} else requestFullscreen();
	}, [requestFullscreen]);
	const controlsRef = useRef<HTMLDivElement | null>(null);
	const fromControls = (target: EventTarget | null) =>
		target instanceof Node && controlsRef.current !== null && controlsRef.current.contains(target);
	const onClick = (e: ReactMouseEvent<HTMLDivElement>) => {
		if (!clickToPlay || fromControls(e.target)) return;
		if (doubleClickToFullscreen) {
			if (clickTimer.current !== null) clearTimeout(clickTimer.current);
			unlockAudio();
			clickTimer.current = setTimeout(() => {
				clickTimer.current = null;
				store.toggle();
			}, DOUBLE_CLICK_MS);
			return;
		}
		unlockAudio();
		store.toggle();
	};
	const onDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
		if (!doubleClickToFullscreen || fromControls(e.target)) return;
		if (clickTimer.current !== null) {
			clearTimeout(clickTimer.current);
			clickTimer.current = null;
		}
		if (allowFullscreen && isFullscreenSupported()) toggleFullscreen();
	};
	const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
		if (!controls || !spaceKeyToPlayOrPause) return;
		if (e.key !== " " || isTypingTarget(e.target)) return;
		e.preventDefault();
		unlockAudio();
		store.toggle();
	};

	const visibility = useControlsVisibility(
		alwaysShowControls,
		initiallyShowControls,
		hideControlsWhenPointerDoesntMove,
		snap.scrubbing,
	);
	const isBuffering = useDelayedFlag(snap.buffering, bufferStateDelayInMilliseconds);

	const Comp = useCompositionComponent(props.component, props.lazyComponent);
	const boundaryKey = useComponentKey(Comp);
	const inputProps = (props.inputProps ?? EMPTY_PROPS) as Record<string, unknown>;
	const config = useMemo(
		() => makeVideoConfig(fps, durationInFrames, compositionWidth, compositionHeight, inputProps),
		[fps, durationInFrames, compositionWidth, compositionHeight, inputProps],
	);
	const onError = useCallback((error: Error) => emitter.dispatch("error", { error }), [emitter]);

	const posterVisible =
		renderPoster !== undefined &&
		((showPosterWhenUnplayed && !snap.hasPlayed && !snap.playing) ||
			(showPosterWhenPaused && !snap.playing && !snap.scrubbing) ||
			(showPosterWhenEnded && !moveToBeginningWhenEnded && snap.ended && !snap.playing) ||
			(showPosterWhenBuffering && snap.playing && isBuffering) ||
			(showPosterWhenBufferingAndPaused && !snap.playing && isBuffering));
	const posterSize =
		posterFillMode === "composition-size"
			? { width: compositionWidth, height: compositionHeight }
			: size;
	const poster =
		posterVisible && renderPoster
			? renderPoster({ width: posterSize.width, height: posterSize.height, isBuffering })
			: null;

	const playbackRates =
		showPlaybackRateControl === true
			? DEFAULT_PLAYBACK_RATES
			: Array.isArray(showPlaybackRateControl)
				? showPlaybackRateControl
				: null;

	const classes = [overrideInternalClassName ?? INTERNAL_CLASS_NAME, className]
		.filter(Boolean)
		.join(" ");

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: the container is the video surface; clicks and the space key toggle playback like a native video element, and the buttons in the controls bar are the accessible equivalents
		<div
			ref={container}
			className={classes}
			style={outerStyle(style, compositionWidth, compositionHeight, overflowVisible)}
			tabIndex={controls ? 0 : undefined}
			onClick={onClick}
			onDoubleClick={onDoubleClick}
			onKeyDown={onKeyDown}
			onPointerMove={controls ? visibility.onPointerMove : undefined}
			onPointerEnter={controls ? visibility.onPointerEnter : undefined}
			onPointerLeave={controls ? visibility.onPointerLeave : undefined}
		>
			<CanvasErrorBoundary key={boundaryKey} onError={onError} fallback={errorFallback}>
				<LoadingBoundary noSuspense={noSuspense} renderLoading={renderLoading} size={size}>
					<ScaledCanvas
						placement={placement}
						compositionWidth={compositionWidth}
						compositionHeight={compositionHeight}
						overflowVisible={overflowVisible}
					>
						{mounted ? (
							<CompositionTree
								component={Comp as never}
								config={config}
								frame={snap.frame}
								scale={placement.scale}
								buffer={store.bufferState}
								playback={playback}
							/>
						) : null}
						{poster && posterFillMode === "composition-size" ? (
							<div style={{ position: "absolute", inset: 0 }}>{poster}</div>
						) : null}
					</ScaledCanvas>
				</LoadingBoundary>
			</CanvasErrorBoundary>
			{poster && posterFillMode === "player-size" ? (
				<div style={{ position: "absolute", inset: 0 }}>{poster}</div>
			) : null}
			{controls ? (
				<div ref={controlsRef}>
					<Controls
						store={store}
						fps={fps}
						durationInFrames={durationInFrames}
						inFrame={inFrame}
						outFrame={outFrame}
						playbackRate={effectiveRate}
						visible={visibility.visible}
						isBuffering={isBuffering}
						showVolumeControls={showVolumeControls}
						fullscreenAvailable={allowFullscreen && fullscreenSupported}
						isFullscreen={isFullscreen}
						onToggle={() => {
							unlockAudio();
							store.toggle();
						}}
						onToggleFullscreen={toggleFullscreen}
						playbackRates={playbackRates}
						onPlaybackRateChange={(rate) => setRateOverride({ prop: playbackRate, rate })}
						renderPlayPauseButton={props.renderPlayPauseButton}
						renderFullscreenButton={props.renderFullscreenButton}
						renderMuteButton={props.renderMuteButton}
						renderVolumeSlider={props.renderVolumeSlider}
						renderCustomControls={props.renderCustomControls}
					/>
				</div>
			) : null}
		</div>
	);
}

/**
 * Plays a composition inside a React app, on the real clock. Takes the component directly
 * (not a `<Composition>`), its timing and size, and exposes a `PlayerRef` with playback methods
 * and events.
 */
export const Player = forwardRef(PlayerInner) as <
	Schema = unknown,
	Props extends Record<string, unknown> = Record<string, unknown>,
>(
	props: PlayerProps<Schema, Props> & { ref?: Ref<PlayerRef> },
) => ReactElement;
