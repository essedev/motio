/**
 * The contract between a rendered page and the Node renderer (see docs/ARCHITECTURE.md,
 * "The page and the frame protocol"). Types only, plus the version constant; both sides
 * import it from `@motiojs/core/protocol`.
 */

/**
 * Bumped on any breaking change to the types below. The renderer refuses other versions.
 * 2: per-frame `AudioIntent` with the source position, and `RunContext.mediaBaseUrl`.
 */
export const PROTOCOL_VERSION = 2;

/** Name of the global the page installs. */
export const PAGE_API_GLOBAL = "__motio";

/** Name of the global the renderer injects before any page script runs. */
export const RUN_CONTEXT_GLOBAL = "__motioContext";

/** Attribute on `<html>` holding the last frame rendered, read back after each seek. */
export const FRAME_ATTRIBUTE = "data-motio-frame";

/** Attribute a `Sequence` writes on its wrapper: the absolute frame it starts at. */
export const SEQUENCE_FROM_ATTRIBUTE = "data-motio-from";

/**
 * How a page's clock relates to the frame (ARCHITECTURE, "Time"). `frame`: the clock is the real
 * one and only the frame drives the composition, any frame renders in any order. `virtual`: a shim
 * makes `Date`, `performance.now`, timers, `requestAnimationFrame` and `Math.random` follow the
 * frame, and each page renders ascending frames, stepping through every frame from frame 0.
 */
export type TimeModel = "frame" | "virtual";

/** Values of `TimeModel`, for validating options. */
export const TIME_MODELS: readonly TimeModel[] = ["frame", "virtual"];

/** Injected by the renderer with `Page.addScriptToEvaluateOnNewDocument`. */
export interface RunContext {
	protocol: number;
	/** Props passed with `--props` or `inputProps`; returned by `getInputProps()`. */
	inputProps: Record<string, unknown>;
	/** Environment variables exposed to the bundle. */
	env: Record<string, string>;
	timeModel: TimeModel;
	/** Default readiness timeout, `timeoutInMilliseconds` in Remotion. */
	readinessTimeoutMs: number;
	/** True in a render, false in `dev` and the Player. */
	isRendering: boolean;
	/**
	 * Seed mixed with the frame number to reseed `Math.random` on every frame in the virtual time
	 * model. Default 0.
	 */
	frameSeed?: number;
	/**
	 * Absolute URL, ending in `/`, of the renderer's media service (see `MEDIA_ROUTES`). Media
	 * components read extracted video frames and media information from it during a render.
	 */
	mediaBaseUrl?: string;
}

/**
 * Routes of the renderer's media service, relative to `RunContext.mediaBaseUrl`. Each takes the
 * media URL as the `src` query parameter.
 *
 * - `info`: JSON `MediaInfo`.
 * - `frame`: the source frame shown at `t` seconds (`mode` `floor` or `nearest`), as an image.
 * - `locate`: JSON `FrameLocation` for `t` and `mode`.
 */
export const MEDIA_ROUTES = { info: "info", frame: "frame", locate: "locate" } as const;

/** What the media service's `info` route returns. */
export interface MediaInfo {
	/** Duration of the longest stream, in seconds; null when the container does not say. */
	durationInSeconds: number | null;
	/** The first video stream, if any. */
	video: { width: number; height: number; frameCount: number } | null;
	/** Number of audio streams. */
	audioStreams: number;
}

/** What the media service's `locate` route returns. */
export interface FrameLocation {
	/** Index of the selected source frame. */
	index: number;
	/** Presentation time of that frame, in seconds from the stream start. */
	timestamp: number;
	/** The middle of the frame's display interval: where a native element must seek to show it. */
	seekTime: number;
}

/** Error body of the media service, with an HTTP error status. */
export interface MediaServiceError {
	code: string;
	message: string;
}

/**
 * A composition as registered by the project, before `calculateMetadata`. Dimensions, fps and
 * duration omitted on a composition with `calculateMetadata` are reported as 0 until
 * `setComposition` resolves them.
 */
export interface CompositionInfo {
	id: string;
	width: number;
	height: number;
	fps: number;
	durationInFrames: number;
	defaultProps: Record<string, unknown>;
	/** Present when the composition defines `calculateMetadata`. */
	hasCalculateMetadata: boolean;
	/** True for `<Still>`. */
	isStill: boolean;
	defaultCodec: string | null;
	defaultOutName: string | null;
	defaultPixelFormat: string | null;
	defaultVideoImageFormat: string | null;
	defaultProResProfile?: string | null;
	defaultSampleRate?: number | null;
	/** The time model the composition declares; absent when it declares none (the frame model). */
	timeModel?: TimeModel;
}

/** A composition after `calculateMetadata` ran with the final props. */
export interface ResolvedComposition extends CompositionInfo {
	props: Record<string, unknown>;
}

export type FrameWarningCode =
	| "W_FONT_FALLBACK"
	| "W_SLOW_READINESS"
	| "W_FRAME_MISMATCH"
	| "W_ANIMATION_UNSEEKABLE"
	/** `Math.random()` was called while a frame rendered: frames differ on every render. */
	| "W_MATH_RANDOM"
	/** `staticFile()` named a file whose case differs from the file in `public/`. */
	| "W_STATIC_FILE_CASE"
	/** A timeline (`<TransitionSeries>`) ends before the composition: the last frames are empty. */
	| "W_TIMELINE_SHORT"
	/** Frame model: a CSS transition started while a frame rendered; it is shown at its end. */
	| "W_CSS_TRANSITION"
	/**
	 * Frame model: a `requestAnimationFrame` loop runs on the page, on the real clock. Motio
	 * pauses it while a frame is captured; what it draws differs between renders.
	 */
	| "W_ANIMATION_FRAME_LOOP";

export interface FrameWarning {
	code: FrameWarningCode;
	message: string;
	/**
	 * Stable identity of the warning within a render, for deduplication across frames and pages
	 * (a message may carry values that vary, such as a duration). Absent: the message is the
	 * identity. The frame a warning was seen on travels separately, never in the message.
	 */
	key?: string;
}

/** A readiness handle still open while the page settles a frame, from `PageApi.pending()`. */
export interface PendingHandle {
	/** The label passed to `delayRender()`, or null. */
	label: string | null;
	/** Real milliseconds since the handle was opened. */
	elapsedMs: number;
	/** The handle's timeout in milliseconds. */
	timeoutMs: number;
}

/**
 * An audio source playing on one frame, reported by a media component in `FrameReport.audio`.
 * The renderer joins the intents of consecutive frames into continuous segments: a segment
 * continues while `sourceFrame` advances by `playbackRate` per frame.
 */
export interface AudioIntent {
	/**
	 * Tells apart intents that are otherwise identical (the same source at the same position),
	 * numbered from "0" in volume order.
	 */
	id: string;
	/** Absolute URL of the media. */
	src: string;
	/**
	 * Position in the source at the start of this frame, in composition frames (seconds times
	 * fps), after trimming and looping.
	 */
	sourceFrame: number;
	/** Source frames per composition frame: the media's `playbackRate` times enclosing rates. */
	playbackRate: number;
	/** Pitch factor (`toneFrequency`), 1 for none. */
	toneFrequency: number;
	/** False when the pitch follows `playbackRate` instead of being kept. */
	preservePitch: boolean;
	/** Linear volume on this frame, 0 when muted. */
	volume: number;
	/** Zero-based audio stream of the file; null picks the first one. */
	audioStreamIndex: number | null;
}

export interface FrameReport {
	/** The frame number read back from the DOM after rendering. */
	frame: number;
	warnings: FrameWarning[];
	audio: AudioIntent[];
	timings: { renderMs: number; settleMs: number };
}

export type PageErrorCode =
	| "E_READINESS_TIMEOUT"
	| "E_CANCELLED"
	| "E_COMPOSITION_NOT_FOUND"
	| "E_CALCULATE_METADATA"
	| "E_INVALID_COMPOSITION"
	| "E_RENDER_ERROR"
	/** A file the composition loads (an image, a static file) does not exist. */
	| "E_ASSET_NOT_FOUND"
	/** A font file could not be fetched or decoded. */
	| "E_FONT_LOAD";

/** Serialised error crossing the page boundary; `seek` and `setComposition` reject with it. */
export interface PageError {
	code: PageErrorCode;
	message: string;
	/** Readiness handle label, for timeouts. */
	label?: string;
	frame?: number;
	stack?: string;
	/** For timeouts: the `retries` of the handle; the renderer retries the frame on a fresh page. */
	retries?: number;
	/** For timeouts: the timeout that elapsed, in milliseconds. */
	timeoutMs?: number;
	/** Structured context, JSON-serialisable (for missing assets: `path`, `url`, `suggestion`). */
	details?: Record<string, unknown>;
}

/** Metadata a composition was already resolved to, for example by `selectComposition()`. */
export interface ResolvedMetadata {
	width: number;
	height: number;
	fps: number;
	durationInFrames: number;
	props: Record<string, unknown>;
	defaultCodec?: string | null;
	defaultOutName?: string | null;
	defaultPixelFormat?: string | null;
	defaultVideoImageFormat?: string | null;
	defaultProResProfile?: string | null;
	defaultSampleRate?: number | null;
}

/** Options of `PageApi.setComposition`. */
export interface SetCompositionOptions {
	/**
	 * Use this metadata as is and do not run `calculateMetadata` again (Remotion's `renderMedia`
	 * and `renderStill` render the composition object they are given). `props` is then ignored.
	 */
	resolved?: ResolvedMetadata;
}

/** Installed by the page as `window.__motio`. */
export interface PageApi {
	protocol: number;
	getCompositions(): Promise<CompositionInfo[]>;
	/**
	 * Selects a composition. `props` are input props, merged over the default props before
	 * `calculateMetadata` runs; with `options.resolved` the given metadata is used instead.
	 */
	setComposition(
		id: string,
		props: Record<string, unknown>,
		options?: SetCompositionOptions,
	): Promise<ResolvedComposition>;
	/**
	 * Resolves when the frame is ready to capture; rejects with a `PageError`. In the virtual time
	 * model the page first steps through every frame between the last one it rendered and `frame`
	 * (from frame 0 on a new page), and rejects a frame at or before the last one.
	 */
	seek(frame: number): Promise<FrameReport>;
	/**
	 * The time models the page implements. The renderer refuses the virtual model on a page that
	 * does not list it. Optional: bundles built before the virtual model was wired do not provide
	 * it, and implement the frame model only.
	 */
	timeModels?: readonly TimeModel[];
	/**
	 * Virtual time model: steps through every frame after the last one rendered up to `frame`
	 * included, as `seek` does before its frame, without reporting them. The renderer warms a new
	 * page up in several calls, so each stays within the watchdog. Present when `timeModels`
	 * lists `virtual`; rejects in the frame model.
	 */
	advance?(frame: number): Promise<void>;
	/**
	 * The error passed to `cancelRender()`, if it was called, as an `E_CANCELLED` page error.
	 * `cancelRender()` throws, so a call outside React's render (a timer, a promise callback)
	 * surfaces as an uncaught page error; the renderer asks this to report it as a cancellation.
	 * Optional: bundles built before it was added do not provide it.
	 */
	cancelled?(): PageError | null;
	/**
	 * The readiness handles open right now, answered at once (not queued behind a running
	 * `seek`), so the renderer can report what a slow frame waits for. Optional: bundles built
	 * before it was added do not provide it.
	 */
	pending?(): PendingHandle[];
}
