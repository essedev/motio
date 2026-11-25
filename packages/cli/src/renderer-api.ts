import { MotioError } from "@motiojs/compat";
import type {
	ColorSpace,
	Concurrency,
	FrameRange,
	LogLevel,
	PixelFormat,
} from "@motiojs/compat/config";

/**
 * The part of `@motiojs/renderer` the CLI uses, typed here so commands can be tested with
 * fakes and so the CLI does not break while the renderer is being written. The shapes follow
 * Remotion's documented `@remotion/renderer` API.
 */

/** A composition as returned by `getCompositions` and `selectComposition`. */
export interface VideoConfig {
	id: string;
	width: number;
	height: number;
	fps: number;
	durationInFrames: number;
	defaultProps: Record<string, unknown>;
	props: Record<string, unknown>;
	defaultCodec: string | null;
	defaultOutName: string | null;
	defaultVideoImageFormat?: string | null;
	defaultPixelFormat?: string | null;
}

export interface ChromiumOptions {
	gl?: string | null;
	ignoreCertificateErrors?: boolean;
	disableWebSecurity?: boolean;
	headless?: boolean;
	userAgent?: string | null;
	darkMode?: boolean;
	flags?: Record<string, boolean | string>;
	features?: Record<string, boolean>;
	blinkFeatures?: Record<string, boolean>;
}

export interface BrowserLog {
	type: string;
	text: string;
}

/** A delayRender() handle still pending, as the renderer reports it. */
export interface DelayRenderPending {
	label: string | null;
	frame: number | null;
	compositionId?: string | null;
	elapsedMs: number;
	timeoutMs: number;
}

/** A rectangle of a captured frame, in pixels. */
export interface CanvasRegion {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Options shared by every call that opens the bundle. */
export interface SessionOptions {
	serveUrl: string;
	inputProps?: Record<string, unknown>;
	envVariables?: Record<string, string>;
	timeoutInMilliseconds?: number;
	chromiumOptions?: ChromiumOptions;
	browserExecutable?: string | null;
	port?: number | null;
	onBrowserLog?: (log: BrowserLog) => void;
	/**
	 * Called by the renderer every few seconds while a delayRender() handle is pending, once per
	 * handle; `frame` is null outside a seek (calculateMetadata, collecting the root).
	 */
	onDelayRenderPending?: (info: DelayRenderPending) => void;
	logLevel?: LogLevel;
	captureMethod?: "auto" | "begin-frame" | "screenshot";
	pagesPerBrowser?: number | null;
	timeModel?: "frame" | "virtual" | null;
	raster?: "cpu" | "gpu" | null;
	canvas?: "software" | "gpu" | null;
	timeZone?: string | null;
	ffmpegExecutable?: string | null;
	ffprobeExecutable?: string | null;
}

/** Where the FFmpeg of a command came from (D-065). */
export type FfmpegSource = "option" | "env" | "package" | "path";

/** The FFmpeg and ffprobe a command uses, as the renderer resolves them. */
export interface ResolvedFfmpeg {
	ffmpeg: string;
	ffprobe: string;
	source: FfmpegSource;
	/** The pinned build, when `source` is `package`. */
	pinned?: { version: string; build: number };
	/**
	 * Set when the pinned build of `@motiojs/ffmpeg` could not be used (archives not published,
	 * offline) and the FFmpeg on PATH is used instead.
	 */
	fallback?: { code?: string; reason: string; message: string };
}

/** Options of the FFmpeg resolution. */
export interface ResolveFfmpegOptions {
	/** An FFmpeg executable to use as is (the config's `ffmpeg.executable`). */
	ffmpegExecutable?: string;
	/** An ffprobe executable (the config's `ffmpeg.ffprobeExecutable`). */
	ffprobeExecutable?: string;
	/** False never downloads: an installed package without its build resolves to null. */
	download?: boolean;
	onDownloadProgress?: (progress: { downloadedBytes: number; totalBytes: number }) => void;
}

/** The part of `@motiojs/ffmpeg` that `motio ffmpeg ensure` and `doctor` call. */
export interface FfmpegPackageApi {
	/** False while the archives of the pinned build cannot be downloaded (not published yet). */
	archivesPublished?(): boolean;
	/** The pinned FFmpeg release and build. */
	FFMPEG_VERSION?: string;
	FFMPEG_BUILD?: number;
	ensureFfmpeg(options?: {
		onProgress?: (progress: { downloadedBytes: number; totalBytes: number }) => void;
	}): Promise<{
		ffmpeg: string;
		ffprobe: string;
		version: string;
		build: number;
		platform: string;
		directory: string;
		downloaded: boolean;
	}>;
}

export interface CancelSignalHandle {
	cancelSignal: unknown;
	cancel: () => void;
}

export interface RenderMediaProgress {
	renderedFrames: number;
	encodedFrames: number;
	progress: number;
}

export interface RenderMediaOptions extends SessionOptions {
	composition: VideoConfig;
	codec: string;
	outputLocation: string;
	overwrite?: boolean;
	crf?: number | null;
	imageFormat?: "jpeg" | "png" | "none";
	jpegQuality?: number;
	frameRange?: FrameRange | null;
	everyNthFrame?: number;
	concurrency?: Concurrency | null;
	scale?: number;
	pixelFormat?: PixelFormat;
	colorSpace?: ColorSpace;
	x264Preset?: string;
	proResProfile?: string | null;
	proResBitsPerMacroblock?: number | null;
	numberOfGifLoops?: number | null;
	audioCodec?: string;
	audioBitrate?: string | null;
	enforceAudioTrack?: boolean;
	preferLossless?: boolean;
	sampleRate?: number | null;
	separateAudioTo?: string | null;
	muted?: boolean;
	cancelSignal?: unknown;
	onProgress?: (progress: RenderMediaProgress) => void;
}

export interface RenderStillOptions extends SessionOptions {
	composition: VideoConfig;
	output: string;
	frame?: number;
	imageFormat?: "png" | "jpeg" | "webp" | "pdf";
	jpegQuality?: number;
	scale?: number;
	overwrite?: boolean;
	cancelSignal?: unknown;
}

export interface RenderFramesOptions extends SessionOptions {
	composition: VideoConfig;
	outputDir: string | null;
	onFrameBuffer?: (buffer: Buffer, frame: number) => void | Promise<void>;
	onFrameUpdate?: (framesRendered: number, frame: number, timeToRender: number) => void;
	imageFormat?: "jpeg" | "png" | "none";
	jpegQuality?: number;
	scale?: number;
	concurrency?: Concurrency | null;
	frames?: number[];
	frameRange?: FrameRange | null;
	everyNthFrame?: number;
	imageSequencePattern?: string;
	cancelSignal?: unknown;
	/**
	 * Motio extension requested from the renderer: the order frames are handed to pages,
	 * so `check determinism` can render in several orders (supported by `renderFrames`).
	 */
	frameOrder?: (frames: number[]) => number[];
	/** Motio extension: replace a page with a new one after this many frames. */
	recycleEveryNFrames?: number;
	/** Motio extension: where each frame's canvases are, in captured pixels. */
	onCanvasRegions?: (regions: CanvasRegion[], frame: number) => void;
}

export interface EnsuredBrowser {
	executablePath: string;
	version?: string;
	platform?: string;
	downloaded?: boolean;
}

export interface FfmpegInfo {
	path: string;
	version: string;
	encoders: ReadonlySet<string>;
	decoders: ReadonlySet<string>;
}

export interface RendererApi {
	getCompositions(options: SessionOptions): Promise<VideoConfig[]>;
	selectComposition(options: SessionOptions & { id: string }): Promise<VideoConfig>;
	renderMedia(options: RenderMediaOptions): Promise<unknown>;
	renderStill(options: RenderStillOptions): Promise<unknown>;
	/** Results may carry `warnings: { code, message, frame? }[]` (read with `renderWarningsOf`). */
	renderFrames(options: RenderFramesOptions): Promise<{ frameCount: number }>;
	ensureBrowser(options?: {
		onProgress?: (progress: { downloadedBytes: number; totalBytes: number }) => void;
	}): Promise<EnsuredBrowser>;
	makeCancelSignal(): CancelSignalHandle;
	/** Optional: FFmpeg probing for `doctor`. */
	probeFfmpeg?(path: string): Promise<FfmpegInfo>;
	/** Optional: the encoders of each video codec, in order of preference, for `doctor`. */
	VIDEO_CODEC_SPECS?: Readonly<Record<string, { encoders: readonly string[] }>>;
	/** Optional: the renderer's FFmpeg resolution (D-065). */
	resolveFfmpeg?(options?: ResolveFfmpegOptions): Promise<ResolvedFfmpeg | null>;
	/** Optional: loads `@motiojs/ffmpeg` when it is installed, for `motio ffmpeg ensure`. */
	loadFfmpegPackage?(): Promise<FfmpegPackageApi | null>;
	/** Optional: minimum FFmpeg release, for `doctor`. */
	MIN_FFMPEG_VERSION?: readonly [number, number];
	/** Optional: the pinned browser version, for `doctor`. */
	CHROME_VERSION?: string;
	/** Optional: where browsers are cached, for `doctor`. */
	defaultBrowserCacheDir?(): string;
}

/** Options `motio render` passes to `renderDistributed()` from `@motiojs/distributed`. */
export interface RenderDistributedOptions
	extends Omit<RenderMediaOptions, "concurrency" | "onProgress"> {
	framesPerChunk?: number;
	chunks?: number;
	/** Chunks rendering at the same time. */
	concurrency?: number;
	concurrencyPerChunk?: number;
	onProgress?: (progress: { renderedFrames: number; progress: number }) => void;
}

/** The part of `@motiojs/distributed` the CLI calls. */
export interface DistributedApi {
	renderDistributed(options: RenderDistributedOptions): Promise<unknown>;
}

/** Loads `@motiojs/distributed`. */
export async function loadDistributed(): Promise<DistributedApi> {
	try {
		return (await import("@motiojs/distributed")) as unknown as DistributedApi;
	} catch (error) {
		throw new MotioError(
			"E_RENDERER_UNAVAILABLE",
			`@motiojs/distributed could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
			{},
			{ cause: error },
		);
	}
}

const REQUIRED = [
	"getCompositions",
	"selectComposition",
	"renderMedia",
	"renderStill",
	"renderFrames",
	"ensureBrowser",
	"makeCancelSignal",
] as const;

/** Loads `@motiojs/renderer` and checks it exposes what the CLI needs. */
export async function loadRenderer(): Promise<RendererApi> {
	let module: Record<string, unknown>;
	try {
		module = (await import("@motiojs/renderer")) as unknown as Record<string, unknown>;
	} catch (error) {
		throw new MotioError(
			"E_RENDERER_UNAVAILABLE",
			`@motiojs/renderer could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
			{},
			{ cause: error },
		);
	}
	const missing = REQUIRED.filter((name) => typeof module[name] !== "function");
	if (missing.length > 0) {
		throw new MotioError(
			"E_RENDERER_UNAVAILABLE",
			`@motiojs/renderer does not export ${missing.join(", ")} yet.`,
			{ missing },
		);
	}
	return module as unknown as RendererApi;
}
