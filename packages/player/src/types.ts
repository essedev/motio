import type {
	ComponentType,
	CSSProperties,
	LazyExoticComponent,
	ReactNode,
	RefObject,
	SyntheticEvent,
} from "react";

/** Payloads (`event.detail`) of the events a `PlayerRef` dispatches, by event name. */
export interface PlayerEventTypes {
	/** Playback started or resumed. */
	play: undefined;
	/** Playback paused, by a call, a click or because the video ended. */
	pause: undefined;
	/** The video reached its end and `loop` is off. */
	ended: undefined;
	/** The time was changed by `seekTo()` or by the seek bar. */
	seeked: { frame: number };
	/** Periodic time report during playback, at most every 250 ms. */
	timeupdate: { frame: number };
	/** The displayed frame changed, during playback or seeking. */
	frameupdate: { frame: number };
	/** The `playbackRate` prop changed. */
	ratechange: { playbackRate: number };
	/** The volume changed. */
	volumechange: { volume: number };
	/** The player was muted or unmuted. */
	mutechange: { isMuted: boolean };
	/** The scale of the canvas changed because the player was resized. */
	scalechange: { scale: number };
	/** The player entered or left fullscreen. */
	fullscreenchange: { isFullscreen: boolean };
	/** The composition threw while rendering. */
	error: { error: Error };
	/** A component started buffering (`useBufferState().delayPlayback()`). */
	waiting: undefined;
	/** The last buffering handle was released. */
	resume: undefined;
}

/** Payloads of the events a `ThumbnailRef` dispatches. */
export type ThumbnailEventTypes = Pick<PlayerEventTypes, "error" | "waiting" | "resume">;

/** A listener for a Player event; receives an object whose `detail` is the payload. */
export type CallbackListener<T extends keyof PlayerEventTypes> = (data: {
	detail: PlayerEventTypes[T];
}) => void;

/** A user gesture passed to `play()` or `toggle()`, so autoplay restrictions do not apply. */
export type PlayerGestureEvent = SyntheticEvent | Event;

/** Methods available on the ref of a `<Player>`. */
export interface PlayerRef {
	/** Starts playback. No effect while playing. Pass the triggering event from user gestures. */
	play(e?: PlayerGestureEvent): void;
	/** Pauses playback. No effect while paused. */
	pause(): void;
	/** Plays when paused, pauses when playing. */
	toggle(e?: PlayerGestureEvent): void;
	/** When playing, pauses and returns to the frame where playback last started. */
	pauseAndReturnToPlayStart(): void;
	/** Moves to a frame; playback continues from there when playing. */
	seekTo(frame: number): void;
	/** The frame being displayed. */
	getCurrentFrame(): number;
	/** Whether the player is playing (true while playing and buffering too). */
	isPlaying(): boolean;
	/** The outer element of the player, or null before it mounted. */
	getContainerNode(): HTMLDivElement | null;
	mute(): void;
	unmute(): void;
	/** True when muted or when the volume is 0. */
	isMuted(): boolean;
	/** The volume between 0 and 1; 0 while muted. */
	getVolume(): number;
	/** Sets the volume; throws unless it is a number between 0 and 1. */
	setVolume(volume: number): void;
	/** Whether this player is the fullscreen element. */
	isFullscreen(): boolean;
	/** Enters fullscreen; throws when `allowFullscreen` is false or the browser does not allow it. */
	requestFullscreen(): void;
	/** Leaves fullscreen when this player is the fullscreen element. */
	exitFullscreen(): void;
	/** How much the composition is scaled to fit the player (0.5 for 1920 shown at 960 px). */
	getScale(): number;
	addEventListener<T extends keyof PlayerEventTypes>(name: T, callback: CallbackListener<T>): void;
	removeEventListener<T extends keyof PlayerEventTypes>(
		name: T,
		callback: CallbackListener<T>,
	): void;
}

/** Methods available on the ref of a `<Thumbnail>`. */
export interface ThumbnailRef {
	getContainerNode(): HTMLDivElement | null;
	getScale(): number;
	addEventListener<T extends keyof ThumbnailEventTypes>(
		name: T,
		callback: CallbackListener<T>,
	): void;
	removeEventListener<T extends keyof ThumbnailEventTypes>(
		name: T,
		callback: CallbackListener<T>,
	): void;
}

/** Renders the UI shown while the composition suspends; receives the player size. */
export type RenderLoading = (canvas: { height: number; width: number }) => ReactNode;

/** Renders the poster overlay; `isBuffering` turns true after `bufferStateDelayInMilliseconds`. */
export type RenderPoster = (canvas: {
	height: number;
	width: number;
	isBuffering: boolean;
}) => ReactNode;

/** Replaces the play/pause button content; returning null keeps the default. */
export type RenderPlayPauseButton = (props: {
	playing: boolean;
	isBuffering: boolean;
}) => ReactNode | null;

/** Replaces the fullscreen button content. */
export type RenderFullscreenButton = (props: { isFullscreen: boolean }) => ReactNode;

/** Replaces the mute button; its click does nothing, attach handlers through the `PlayerRef`. */
export type RenderMuteButton = (props: { muted: boolean; volume: number }) => ReactNode;

/** Replaces the volume slider. */
export type RenderVolumeSlider = (props: {
	isVertical: boolean;
	volume: number;
	onBlur: () => void;
	inputRef: RefObject<HTMLInputElement | null>;
	setVolume: (volume: number) => void;
}) => ReactNode;

/** Renders extra controls between the playback controls and the fullscreen button. */
export type RenderCustomControls = () => ReactNode;

/** Renders the UI shown after the composition threw. */
export type ErrorFallback = (info: { error: Error }) => ReactNode;

/** Where the poster is drawn: over the whole player, or scaled like the composition. */
export type PosterFillMode = "player-size" | "composition-size";

/** How media keys and the browser's media controls act on the player. */
export interface BrowserMediaControlsBehavior {
	mode: "do-nothing" | "prevent-media-session" | "register-media-session";
}

/** Log levels accepted by `logLevel`. */
export type LogLevel = "trace" | "verbose" | "info" | "warn" | "error";

/** A composition component, eagerly imported. */
// biome-ignore lint/suspicious/noExplicitAny: the props of user components are checked at the call site
export type CompositionComponent<Props> = ComponentType<Props> | LazyExoticComponent<any>;

/** A function returning a dynamic import of the composition component. */
export type LazyComponentLoader<Props> = () => Promise<{ default: ComponentType<Props> }>;

/** Either `component` or `lazyComponent`, never both. */
export type CompositionSource<Props> =
	| { component: CompositionComponent<Props>; lazyComponent?: undefined }
	| { lazyComponent: LazyComponentLoader<Props>; component?: undefined };

/** Props shared by `<Player>` and `<Thumbnail>`. */
export interface SharedCanvasProps<Props> {
	durationInFrames: number;
	fps: number;
	compositionWidth: number;
	compositionHeight: number;
	/** The props passed to the component. */
	inputProps?: Props;
	/** Styles of the outer element; `width` and `height` here override the composition size. */
	style?: CSSProperties;
	className?: string;
	/** Replaces the default `__remotion-player` class of the outer element. */
	overrideInternalClassName?: string;
	/** Lets the composition draw outside its canvas. Default false. */
	overflowVisible?: boolean;
	errorFallback?: ErrorFallback;
	renderLoading?: RenderLoading;
	/** Renders without a `Suspense` boundary (for tests). Default false. */
	noSuspense?: boolean;
	/** Accepted for compatibility; Motio logs only warnings and errors. */
	logLevel?: LogLevel;
	/** Accepted for compatibility; Motio has no effect backends yet. */
	preferredEffectBackend?: "auto" | "webgpu" | "webgl2" | "2d";
}

/** Props of `<Player>`. `Schema` is only used for type inference, as in Remotion. */
export type PlayerProps<
	_Schema = unknown,
	Props extends Record<string, unknown> = Record<string, unknown>,
> = CompositionSource<Props> &
	SharedCanvasProps<Props> & {
		/** A Zod schema for type inference only; `inputProps` are not validated against it. */
		schema?: unknown;
		/** Restart when the end is reached. Default false. */
		loop?: boolean;
		/** Start playing once mounted. Default false. */
		autoPlay?: boolean;
		/** Show the seek bar and the buttons. Default false. */
		controls?: boolean;
		/** Show mute and volume controls (with `controls`). Default true. */
		showVolumeControls?: boolean;
		/** Allow fullscreen. Default true. */
		allowFullscreen?: boolean;
		/** Toggle playback on click. Default: the value of `controls`. */
		clickToPlay?: boolean;
		/** Toggle fullscreen on double click; single clicks then wait 200 ms. Default false. */
		doubleClickToFullscreen?: boolean;
		/** Toggle playback with the space key (with `controls`). Default true. */
		spaceKeyToPlayOrPause?: boolean;
		/** Go back to the start (or `inFrame`) after the end when not looping. Default true. */
		moveToBeginningWhenEnded?: boolean;
		/** Frame shown on mount. Cannot change after mount. Default 0. */
		initialFrame?: number;
		/** Speed, between -10 and 10, not 0. Negative plays backwards. Default 1. */
		playbackRate?: number;
		/** First frame of the playback range. Default null. */
		inFrame?: number | null;
		/** Last frame of the playback range. Default null. */
		outFrame?: number | null;
		/** Shared audio tags for autoplay on iOS. Cannot change after mount. Default 5. */
		numberOfSharedAudioTags?: number;
		/** Sample rate of the preview audio context. Cannot change after mount. Default 48000. */
		sampleRate?: number;
		/** Seconds each `Sequence` is premounted for by default. Default 0. */
		defaultPremountInSeconds?: number;
		/** Delay before buffering shows in the UI (the events fire at once). Default 300. */
		bufferStateDelayInMilliseconds?: number;
		/** Keep pitch when the playback rate changes, for `@remotion/media`. Default false. */
		preservePitch?: boolean;
		/** Controls shown on mount: true, false, or for how many ms. Default true (2 s). */
		initiallyShowControls?: boolean | number;
		/** Never hide the controls. Default false. */
		alwaysShowControls?: boolean;
		/** Hide controls after the pointer stops (true: 3000 ms, or a delay in ms). Default true. */
		hideControlsWhenPointerDoesntMove?: boolean | number;
		/** Show a playback rate menu; true for the default rates. Default false. */
		showPlaybackRateControl?: boolean | number[];
		/** Start muted. Default false. */
		initiallyMuted?: boolean;
		/** Starting volume between 0 and 1; disables volume persistence. */
		initialVolume?: number;
		/** `localStorage` key the volume is kept under. Default `remotion.volumePreference`. */
		volumePersistenceKey?: string;
		/** What media keys do. Default `{ mode: "prevent-media-session" }`. */
		browserMediaControlsBehavior?: BrowserMediaControlsBehavior;
		renderPoster?: RenderPoster;
		showPosterWhenUnplayed?: boolean;
		showPosterWhenPaused?: boolean;
		/** Requires `moveToBeginningWhenEnded={false}`. */
		showPosterWhenEnded?: boolean;
		showPosterWhenBuffering?: boolean;
		showPosterWhenBufferingAndPaused?: boolean;
		posterFillMode?: PosterFillMode;
		renderPlayPauseButton?: RenderPlayPauseButton;
		renderFullscreenButton?: RenderFullscreenButton;
		renderMuteButton?: RenderMuteButton;
		renderVolumeSlider?: RenderVolumeSlider;
		renderCustomControls?: RenderCustomControls;
		/** Accepted for compatibility; Motio prints no licence message. */
		acknowledgeRemotionLicense?: boolean;
		/** Accepted for compatibility; used by audio components that create an AudioContext. */
		audioLatencyHint?: "interactive" | "balanced" | "playback";
		/** Experimental; cannot change after mount. */
		_experimentalKeepAudioContextAlive?: boolean;
	};

/** Props of `<Thumbnail>`. */
export type ThumbnailProps<
	_Schema = unknown,
	Props extends Record<string, unknown> = Record<string, unknown>,
> = CompositionSource<Props> &
	SharedCanvasProps<Props> & {
		/** The frame to render. */
		frameToDisplay: number;
		schema?: unknown;
	};
