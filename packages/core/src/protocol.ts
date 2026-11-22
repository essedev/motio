/**
 * The contract between a rendered page and the Node renderer (see docs/ARCHITECTURE.md,
 * "The page and the frame protocol"). Types only, plus the version constant; both sides
 * import it from `@motiojs/core/protocol`.
 */

/** Bumped on any breaking change to the types below. The renderer refuses other versions. */
export const PROTOCOL_VERSION = 1;

/** Name of the global the page installs. */
export const PAGE_API_GLOBAL = "__motio";

/** Name of the global the renderer injects before any page script runs. */
export const RUN_CONTEXT_GLOBAL = "__motioContext";

/** Attribute on `<html>` holding the last frame rendered, read back after each seek. */
export const FRAME_ATTRIBUTE = "data-motio-frame";

/** Attribute a `Sequence` writes on its wrapper: the absolute frame it starts at. */
export const SEQUENCE_FROM_ATTRIBUTE = "data-motio-from";

export type TimeModel = "frame" | "virtual";

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
}

/** A composition after `calculateMetadata` ran with the final props. */
export interface ResolvedComposition extends CompositionInfo {
	props: Record<string, unknown>;
}

export type FrameWarningCode =
	| "W_FONT_FALLBACK"
	| "W_SLOW_READINESS"
	| "W_FRAME_MISMATCH"
	| "W_ANIMATION_UNSEEKABLE";

export interface FrameWarning {
	code: FrameWarningCode;
	message: string;
}

/** An audio source active on a frame, collected by the audio pass (M3). */
export interface AudioIntent {
	id: string;
	src: string;
	/** Absolute composition frame where the source starts playing. */
	startFrame: number;
	/** Source offset in frames at the start, after trim. */
	trimBeforeFrames: number;
	playbackRate: number;
	toneFrequency: number;
	volume: number;
	muted: boolean;
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
	| "E_RENDER_ERROR";

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
}

/** Installed by the page as `window.__motio`. */
export interface PageApi {
	protocol: number;
	getCompositions(): Promise<CompositionInfo[]>;
	setComposition(id: string, props: Record<string, unknown>): Promise<ResolvedComposition>;
	/** Resolves when the frame is ready to capture; rejects with a `PageError`. */
	seek(frame: number): Promise<FrameReport>;
}
