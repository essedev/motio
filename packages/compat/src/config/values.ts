/** Option values shared by `remotion.config.ts`, the bundler and the CLI. */

export const CODECS = [
	"h264",
	"h265",
	"vp8",
	"vp9",
	"av1",
	"prores",
	"mp3",
	"aac",
	"wav",
	"h264-mkv",
	"h264-ts",
	"gif",
] as const;
export type Codec = (typeof CODECS)[number];

export const VIDEO_IMAGE_FORMATS = ["jpeg", "png", "none"] as const;
export type VideoImageFormat = (typeof VIDEO_IMAGE_FORMATS)[number];

export const STILL_IMAGE_FORMATS = ["png", "jpeg", "pdf", "webp"] as const;
export type StillImageFormat = (typeof STILL_IMAGE_FORMATS)[number];

export const PIXEL_FORMATS = [
	"yuv420p",
	"yuva420p",
	"yuv422p",
	"yuv444p",
	"yuv420p10le",
	"yuv422p10le",
	"yuv444p10le",
	"yuva444p10le",
] as const;
export type PixelFormat = (typeof PIXEL_FORMATS)[number];

export const COLOR_SPACES = ["default", "bt601", "bt709", "bt2020-ncl"] as const;
export type ColorSpace = (typeof COLOR_SPACES)[number];

export const GL_RENDERERS = [
	"angle",
	"egl",
	"swiftshader",
	"swangle",
	"vulkan",
	"angle-egl",
] as const;
export type GlRenderer = (typeof GL_RENDERERS)[number];

export const LOG_LEVELS = ["trace", "verbose", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const X264_PRESETS = [
	"ultrafast",
	"superfast",
	"veryfast",
	"faster",
	"fast",
	"medium",
	"slow",
	"slower",
	"veryslow",
	"placebo",
] as const;
export type X264Preset = (typeof X264_PRESETS)[number];

export const PRORES_PROFILES = ["4444-xq", "4444", "hq", "standard", "light", "proxy"] as const;
export type ProResProfile = (typeof PRORES_PROFILES)[number];

export const CHROME_MODES = ["headless-shell", "chrome-for-testing"] as const;
export type ChromeMode = (typeof CHROME_MODES)[number];

export const HARDWARE_ACCELERATION = ["disable", "if-possible", "required"] as const;
export type HardwareAcceleration = (typeof HARDWARE_ACCELERATION)[number];

/** `--concurrency` / `setConcurrency`: a thread count, or a share of the CPU threads (`"50%"`). */
export type Concurrency = number | `${number}%`;

/**
 * `--frames` / `setFrameRange`: one frame, an inclusive range, a range open at the end
 * (`[100, null]`), or a list of those.
 */
export type FrameRange =
	| number
	| readonly [number, number]
	| readonly [number, null]
	| ReadonlyArray<number | readonly [number, number] | readonly [number, null]>;

/** A webpack override function as written in `remotion.config.ts`. */
export type WebpackOverrideFn = (
	currentConfiguration: Record<string, unknown>,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

/** Values recorded by the `Config` setters. Absent keys were never set. */
export interface ConfigValues {
	// Bundling
	entryPoint: string;
	publicDir: string;
	publicPath: string;
	bundleOutDir: string;
	cachingEnabled: boolean;
	dotEnvLocation: string;
	webpackOverrides: WebpackOverrideFn[];
	/** Set by `Config.overrideWebpackConfig(enableTailwind)`. */
	tailwind: "v3" | "v4";
	// Rendering
	concurrency: Concurrency | null;
	videoImageFormat: VideoImageFormat;
	stillImageFormat: StillImageFormat;
	jpegQuality: number;
	scale: number;
	muted: boolean;
	codec: Codec;
	audioCodec: string;
	crf: number;
	pixelFormat: PixelFormat;
	colorSpace: ColorSpace;
	x264Preset: X264Preset;
	proResProfile: ProResProfile;
	everyNthFrame: number;
	frameRange: FrameRange | null;
	outputLocation: string;
	overwriteOutput: boolean;
	imageSequence: boolean;
	numberOfGifLoops: number | null;
	videoBitrate: string | null;
	audioBitrate: string | null;
	encodingBufferSize: string | null;
	encodingMaxRate: string | null;
	gopSize: number | null;
	enforceAudioTrack: boolean;
	sampleRate: number;
	metadata: Record<string, string>;
	hardwareAcceleration: HardwareAcceleration;
	disallowParallelEncoding: boolean;
	forSeamlessAacConcatenation: boolean;
	imageSequencePattern: string;
	proResBitsPerMacroblock: number | null;
	preferLosslessAudio: boolean;
	// Composition overrides
	width: number;
	height: number;
	fps: number;
	durationInFrames: number;
	// Browser
	browserExecutable: string | null;
	delayRenderTimeoutInMilliseconds: number;
	chromiumOpenGlRenderer: GlRenderer | null;
	chromiumFlags: Record<string, boolean | string>;
	chromiumFeatures: Record<string, boolean>;
	chromiumBlinkFeatures: Record<string, boolean>;
	chromiumDisableWebSecurity: boolean;
	chromiumIgnoreCertificateErrors: boolean;
	chromiumHeadlessMode: boolean;
	chromiumDarkMode: boolean;
	chromiumUserAgent: string | null;
	chromiumMultiProcessOnLinux: boolean;
	chromeMode: ChromeMode;
	offthreadVideoCacheSizeInBytes: number | null;
	// Misc
	logLevel: LogLevel;
	rendererPort: number | null;
	studioPort: number | null;
	benchmarkRuns: number;
	benchmarkConcurrencies: string;
}
