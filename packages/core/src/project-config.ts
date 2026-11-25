// The shape of `motio.config.ts`, re-exported by `@motiojs/motio/config`. This module holds types
// and `defineConfig` only, with no runtime dependency, so a config file loads without React or
// the browser runtime. `@motiojs/bundler` validates the values (`loadConfig`) and the CLI applies
// them. Every key maps to a CLI flag or a Node API option that exists today; the guide page
// docs/guide/configuration.md documents each one.

/** Video and audio codecs of `motio render`. */
export type Codec =
	| "h264"
	| "h265"
	| "vp8"
	| "vp9"
	| "av1"
	| "prores"
	| "mp3"
	| "aac"
	| "wav"
	| "h264-mkv"
	| "h264-ts"
	| "gif";

/** How each frame of a video is captured before encoding. */
export type VideoImageFormat = "jpeg" | "png" | "none";

/** Formats of `motio still`. */
export type StillImageFormat = "png" | "jpeg" | "pdf" | "webp";

/** Pixel formats passed to FFmpeg. */
export type PixelFormat =
	| "yuv420p"
	| "yuva420p"
	| "yuv422p"
	| "yuv444p"
	| "yuv420p10le"
	| "yuv422p10le"
	| "yuv444p10le"
	| "yuva444p10le";

/** Colour spaces of the encoded video. */
export type ColorSpace = "default" | "bt601" | "bt709" | "bt2020-ncl";

/** x264 speed and size trade-off, from fastest to smallest. */
export type X264Preset =
	| "ultrafast"
	| "superfast"
	| "veryfast"
	| "faster"
	| "fast"
	| "medium"
	| "slow"
	| "slower"
	| "veryslow"
	| "placebo";

/** ProRes profiles, from highest to lowest quality. */
export type ProResProfile = "4444-xq" | "4444" | "hq" | "standard" | "light" | "proxy";

/** Audio codecs of the audio track. */
export type AudioCodec = "aac" | "mp3" | "opus" | "pcm-16";

/** OpenGL backends of Chrome. */
export type GlRenderer = "angle" | "egl" | "swiftshader" | "swangle" | "vulkan" | "angle-egl";

/** How the browser captures frames: `auto` and `screenshot` are the same path today. */
export type CaptureMethod = "auto" | "begin-frame" | "screenshot";

/** Log levels, from most to least verbose. */
export type LogLevel = "trace" | "verbose" | "info" | "warn" | "error";

/** How time advances in the page while rendering. */
export type TimeModel = "frame" | "virtual";

/** Pages rendering in parallel: a count, or a share of the CPU threads such as `"50%"`. */
export type Concurrency = number | `${number}%`;

/** Defaults of `motio render`, named like the options of `renderMedia()`. */
export interface RenderConfig {
	/** Codec; by default inferred from the output extension, else `h264`. */
	codec?: Codec;
	/** Constant rate factor: lower is better quality and bigger files. Default per codec. */
	crf?: number;
	/** Pages rendering in parallel. Default half of the CPU threads, at most 8. */
	concurrency?: Concurrency;
	/** Frame capture format: `png` keeps transparency. Default `jpeg`. */
	imageFormat?: VideoImageFormat;
	/** JPEG quality from 0 to 100 when `imageFormat` is `jpeg`. Default 80. */
	jpegQuality?: number;
	/** Output size factor, above 0 and at most 16. Default 1. */
	scale?: number;
	/** Render without audio. Default false. */
	muted?: boolean;
	/** Pixel format. Default per codec (`yuv420p` for `h264`). */
	pixelFormat?: PixelFormat;
	/** Colour space. Default `default`. */
	colorSpace?: ColorSpace;
	/** x264 preset for `h264`. Default `medium`. */
	x264Preset?: X264Preset;
	/** ProRes profile, used only with the `prores` codec. Default `hq`. */
	proResProfile?: ProResProfile;
	/** GIF loops, used only with the `gif` codec: 0 plays once. Default: loops forever. */
	numberOfGifLoops?: number;
	/** Render every Nth frame (for GIFs). Default 1. */
	everyNthFrame?: number;
	/** Audio codec. Default per codec. */
	audioCodec?: AudioCodec;
	/** Audio bitrate such as `"128k"`. Default per codec. */
	audioBitrate?: string;
	/** Audio sample rate in Hz. Default 48000. */
	sampleRate?: number;
	/** Write a silent audio track when the composition has no audio. Default false. */
	enforceAudioTrack?: boolean;
	/** Prefer a lossless audio codec when the container allows it. Default false. */
	preferLossless?: boolean;
	/** Overwrite an existing output file. Default true. */
	overwrite?: boolean;
	/** File names of `motio render --sequence`, with `[frame]` and `[ext]`. Default `frame-[frame].[ext]`. */
	imageSequencePattern?: string;
	/**
	 * How time advances in the page, for every command that renders (also `still`, `frames` and
	 * the checks): `frame` drives only Motio's frame, `virtual` also the page clock (timers,
	 * `requestAnimationFrame`, `Date.now()`). Default: the composition's `timeModel`, else `frame`.
	 */
	timeModel?: TimeModel;
}

/** Defaults of `motio still`, named like the options of `renderStill()`. */
export interface StillConfig {
	/** Image format; by default inferred from the output extension, else `png`. */
	imageFormat?: StillImageFormat;
	/** JPEG quality from 0 to 100 when `imageFormat` is `jpeg`. Default 80. */
	jpegQuality?: number;
	/** Output size factor, above 0 and at most 16. Default 1. */
	scale?: number;
	/** Overwrite an existing output file. Default true. */
	overwrite?: boolean;
}

/** Chrome switches, the `chromiumOptions` of the Node API. */
export interface ChromiumConfig {
	/** OpenGL backend; `swiftshader` renders WebGL on machines without a GPU. */
	gl?: GlRenderer;
	/** User agent of the pages. */
	userAgent?: string;
	/** Accept invalid TLS certificates. Default false. */
	ignoreCertificateErrors?: boolean;
	/** Disable CORS and other web security. Default false. */
	disableWebSecurity?: boolean;
	/** Emulate `prefers-color-scheme: dark`. Default false. */
	darkMode?: boolean;
	/** Run Chrome headless. Default true. */
	headless?: boolean;
}

/** The browser every command renders in. */
export interface BrowserConfig {
	/** Chrome to use instead of the pinned `chrome-headless-shell`. */
	executable?: string;
	/** How long a frame may wait on `delayRender()`, in milliseconds. Default 30000. */
	timeoutMs?: number;
	/** Frame capture method. Default `auto`. */
	captureMethod?: CaptureMethod;
	/** Pages sharing one browser process. Default: the pages spread over two browsers. */
	pagesPerBrowser?: number;
	/**
	 * How Chrome rasterises the page: `cpu` (the pixels of Remotion's default setting) or `gpu`
	 * (the pixels of Remotion with `gl: "swangle"`; videos take about 2.5 times as long). Default
	 * `cpu`, or `gpu` when `chromiumOptions.gl` is `"swangle"`.
	 */
	raster?: "cpu" | "gpu";
	/**
	 * How Chrome draws a 2D `<canvas>` in transparent captures: `software` (deterministic, faster)
	 * or `gpu` (Remotion's canvas pixels). Default `software`.
	 */
	canvas?: "software" | "gpu";
	/** Chrome switches. */
	chromiumOptions?: ChromiumConfig;
}

/** Which FFmpeg encodes. Unset, Motio uses `@motiojs/ffmpeg` if installed, else `ffmpeg` on PATH. */
export interface FfmpegConfig {
	/** Path to an `ffmpeg` executable. */
	executable?: string;
	/** Path to an `ffprobe` executable. Default: next to `executable`, else on PATH. */
	ffprobeExecutable?: string;
}

/** The preview server of `motio dev`. */
export interface DevConfig {
	/** Port of the preview page; when taken, the next free one is used. Default 3000. */
	port?: number;
	/** Host to bind. Default `localhost`. */
	host?: string;
	/** Open the page in the default browser. Default false. */
	open?: boolean;
	/** The page's keyboard shortcuts. Default true. */
	keyboardShortcuts?: boolean;
}

/**
 * The part of a Vite configuration a `vite` function usually touches. A function annotated with
 * Vite's own `InlineConfig` (`import type { InlineConfig } from "vite"`) is accepted too.
 */
export interface ViteConfig {
	root?: unknown;
	base?: unknown;
	mode?: unknown;
	define?: object;
	plugins?: unknown[];
	publicDir?: unknown;
	cacheDir?: unknown;
	resolve?: object;
	css?: object;
	json?: object;
	esbuild?: unknown;
	oxc?: unknown;
	assetsInclude?: unknown;
	server?: object;
	build?: object;
	preview?: object;
	optimizeDeps?: object;
	ssr?: object;
	worker?: object;
	html?: object;
	experimental?: object;
	environments?: object;
	logLevel?: unknown;
	clearScreen?: unknown;
	envDir?: unknown;
	envPrefix?: unknown;
	appType?: unknown;
	configFile?: unknown;
}

/** The settings of `motio.config.ts`. Every key is optional. */
export interface MotioConfig {
	/** The file that calls `registerRoot()`, relative to the project root. Default: found in common paths. */
	entryPoint?: string;
	/** Static files served by `staticFile()`, relative to the project root. Default `public`. */
	publicDir?: string;
	/** Where renders and stills go when no output is given, relative to the project root. Default `out`. */
	outDir?: string;
	/** Dotenv file to read instead of `.env`, relative to the project root. */
	envFile?: string;
	/** Log level of the CLI. Default `info`. */
	logLevel?: LogLevel;
	/** Compile Tailwind CSS with the version installed in the project. */
	tailwind?: "v3" | "v4";
	/** Defaults of `motio render`. */
	render?: RenderConfig;
	/** Defaults of `motio still`. */
	still?: StillConfig;
	/** The browser every command renders in. */
	browser?: BrowserConfig;
	/** Which FFmpeg encodes. */
	ffmpeg?: FfmpegConfig;
	/** The preview server of `motio dev`. */
	dev?: DevConfig;
	/**
	 * Rewrites the Vite configuration of every bundle and of `motio dev`: return the changed
	 * configuration, for example with more `plugins`.
	 */
	vite?(config: ViteConfig): ViteConfig | Promise<ViteConfig>;
}

/**
 * Types the settings of `motio.config.ts` and returns them unchanged:
 * `export default defineConfig({ render: { codec: "h264" } })`.
 */
export function defineConfig(config: MotioConfig): MotioConfig {
	return config;
}
