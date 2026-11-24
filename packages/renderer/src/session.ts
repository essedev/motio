import type { CompositionInfo, ResolvedComposition } from "@motiojs/core/protocol";
import { BrowserPool, defaultPagesPerBrowser } from "./browser/browser-pool.js";
import { ensureBrowser } from "./browser/ensure.js";
import type { ChromiumOptions } from "./browser/flags.js";
import type { BrowserLog } from "./browser-log.js";
import {
	type CaptureMethod,
	type CaptureMethodOption,
	resolveCaptureMethod,
} from "./capture-method.js";
import { MotioError } from "./errors.js";
import { resolveRenderFfmpeg } from "./ffmpeg-resolve.js";
import { type MediaServer, startMediaServer } from "./media-server.js";
import { type HeadlessBrowser, sharedBrowsers } from "./open-browser.js";
import {
	type LogLevel,
	resolveEnvVariables,
	resolveInputProps,
	resolvePagesPerBrowser,
	resolveTimeout,
} from "./options.js";
import { type PageConfig, RenderPage } from "./render-page.js";
import { openServeUrl, type StaticServer } from "./server.js";
import { StackMapper } from "./stack-map.js";
import { type PendingDelayRender, WarningCollector } from "./warnings.js";

/** Options shared by every function that opens the bundle in a browser. */
export interface BrowserSessionOptions {
	/** Bundle directory or http(s) URL. */
	serveUrl: string;
	/** Props passed to the composition; must be a JSON object. */
	inputProps?: Record<string, unknown>;
	/** Environment variables exposed to the bundle. */
	envVariables?: Record<string, string>;
	/** Readiness timeout per `delayRender()` handle. Default 30000. */
	timeoutInMilliseconds?: number;
	chromiumOptions?: ChromiumOptions;
	/** Use this browser instead of the pinned `chrome-headless-shell`. */
	browserExecutable?: string | null;
	/**
	 * A browser from `openBrowser()`, reused instead of launching one: the call opens tabs on it
	 * and leaves it running; the caller closes it. Its `browserExecutable` and `chromiumOptions`
	 * apply, and this call's are ignored.
	 */
	puppeteerInstance?: HeadlessBrowser | null;
	/** Port of the local bundle server; random if unset. */
	port?: number | null;
	onBrowserLog?: (log: BrowserLog) => void;
	/** Accepted for compatibility; the renderer logs through `onBrowserLog` and errors. */
	logLevel?: LogLevel;
	/**
	 * Motio extension: FFmpeg executable. Default `$MOTIO_FFMPEG`, else the pinned build of
	 * `@motiojs/ffmpeg` when that package is installed, else `ffmpeg` on PATH (D-065).
	 */
	ffmpegExecutable?: string | null;
	/**
	 * Motio extension: FFprobe executable. Default `$MOTIO_FFPROBE`, else `ffprobe` next to the
	 * FFmpeg executable, from the same source.
	 */
	ffprobeExecutable?: string | null;
	/**
	 * Motio extension: how frames are captured (D-013, D-043). `auto` (the default, or
	 * `$MOTIO_CAPTURE_METHOD`) and `screenshot` use `Page.captureScreenshot`; `begin-frame` uses
	 * BeginFrame (Linux only), one page per browser.
	 */
	captureMethod?: CaptureMethodOption | null;
	/**
	 * Motio extension: pages sharing one browser process (D-042). By default the pages are spread
	 * over two browsers (more above concurrency 8, four pages each), which measures fastest; 1
	 * gives every page its own process, which confines a browser crash to one page. BeginFrame
	 * capture always uses one page per browser (Chrome drives BeginFrame for one tab per browser).
	 */
	pagesPerBrowser?: number | null;
	/**
	 * Motio extension: called every 5 seconds for each `delayRender()` handle the render is
	 * waiting on, until it is released or times out, so a long wait is not silent.
	 */
	onDelayRenderPending?: (pending: PendingDelayRender) => void;
}

/** A Remotion-shaped composition description returned by `getCompositions` and `selectComposition`. */
export interface VideoConfig {
	id: string;
	width: number;
	height: number;
	fps: number;
	durationInFrames: number;
	defaultProps: Record<string, unknown>;
	/** Final props: default props merged with input props, after `calculateMetadata`. */
	props: Record<string, unknown>;
	defaultCodec: string | null;
	defaultOutName: string | null;
	defaultVideoImageFormat: string | null;
	defaultPixelFormat: string | null;
	defaultProResProfile: string | null;
	defaultSampleRate: number | null;
}

/** Resolved common options plus the bundle server. */
export interface BrowserSession {
	executablePath: string;
	/** The resolved capture path of the session's render pages. */
	captureMethod: CaptureMethod;
	server: StaticServer;
	/** Media service for video frames and media information (D-015, D-016). */
	media: MediaServer;
	ffmpeg: string;
	ffprobe: string;
	inputProps: Record<string, unknown>;
	envVariables: Record<string, string>;
	timeoutInMilliseconds: number;
	chromiumOptions: ChromiumOptions;
	onBrowserLog: ((log: BrowserLog) => void) | undefined;
	/**
	 * Browsers shared by the session's pages (D-042), killed by `close()` unless they belong to a
	 * `puppeteerInstance`.
	 */
	browsers: BrowserPool;
	/** Warnings the session's pages reported, for the render result. */
	warnings: WarningCollector;
	/**
	 * The configuration of a page; `concurrency` (default 1) is the number of pages the render
	 * opens at once, which sets how many share a browser unless `pagesPerBrowser` was given.
	 */
	pageConfig(size: {
		width: number;
		height: number;
		scale: number;
		transparent: boolean;
		concurrency?: number;
	}): PageConfig;
	close(): Promise<void>;
}

/**
 * Validates the common options, finds the browser and starts the bundle server. With `capture`
 * false (listing compositions) no capture path is probed and pages use the screenshot launch.
 */
export async function openSession(
	options: BrowserSessionOptions,
	capture = true,
): Promise<BrowserSession> {
	const inputProps = resolveInputProps(options.inputProps);
	const envVariables = resolveEnvVariables(options.envVariables);
	const timeoutInMilliseconds = resolveTimeout(options.timeoutInMilliseconds);
	const pagesPerBrowser = resolvePagesPerBrowser(options.pagesPerBrowser);
	const shared = options.puppeteerInstance ? sharedBrowsers(options.puppeteerInstance) : null;
	const chromiumOptions = shared ? shared.chromiumOptions : (options.chromiumOptions ?? {});
	const executablePath =
		shared?.executablePath ??
		options.browserExecutable ??
		process.env.MOTIO_BROWSER_EXECUTABLE ??
		(await ensureBrowser()).executablePath;
	const captureMethod: CaptureMethod = capture
		? await resolveCaptureMethod(options.captureMethod, executablePath, chromiumOptions)
		: "screenshot";
	// Before the bundle server opens, so a failed FFmpeg download leaves nothing running.
	const resolvedFfmpeg = await resolveRenderFfmpeg(options);
	const { ffmpeg, ffprobe } = resolvedFfmpeg;
	const server = await openServeUrl(options.serveUrl, options.port ?? undefined);
	let media: MediaServer;
	try {
		media = await startMediaServer({
			bundleUrl: server.url,
			bundleDir: /^https?:\/\//i.test(options.serveUrl) ? null : options.serveUrl,
			ffmpeg,
			ffprobe,
		});
	} catch (err) {
		await server.close();
		throw err;
	}
	const onBrowserLog = options.onBrowserLog;
	const warnings = new WarningCollector();
	if (resolvedFfmpeg.fallback) {
		warnings.add([{ code: "W_FFMPEG_FALLBACK", message: resolvedFfmpeg.fallback.message }]);
	}
	const stackMapper = new StackMapper(
		server.url,
		/^https?:\/\//i.test(options.serveUrl) ? null : options.serveUrl,
	);
	const onWarnings = (list: readonly { code: string; message: string }[], frame: number) =>
		warnings.add(list, frame);
	// A shared browser outlives the session: its pages close with the render, its processes stay.
	const browsers = shared ? shared.pool : new BrowserPool();
	return {
		executablePath,
		captureMethod,
		server,
		media,
		ffmpeg,
		ffprobe,
		inputProps,
		envVariables,
		timeoutInMilliseconds,
		chromiumOptions,
		onBrowserLog,
		browsers,
		warnings,
		pageConfig: ({ concurrency = 1, ...size }) => ({
			executablePath,
			serveUrl: server.url,
			chromiumOptions,
			inputProps,
			envVariables,
			timeoutInMilliseconds,
			onBrowserLog,
			mediaBaseUrl: media.url,
			captureMethod,
			stackMapper,
			onWarnings,
			onDelayRenderPending: options.onDelayRenderPending,
			browsers: {
				pool: browsers,
				// Headless Chrome drives BeginFrame for one tab per browser: with a second tab under
				// BeginFrame control, neither returns screenshots any more.
				pagesPerBrowser:
					captureMethod === "begin-frame"
						? 1
						: (pagesPerBrowser ?? defaultPagesPerBrowser(concurrency)),
			},
			...size,
		}),
		close: async () => {
			await Promise.all([shared ? undefined : browsers.close(), server.close(), media.close()]);
		},
	};
}

/** Throws `E_INVALID_COMPOSITION` unless the metadata is usable for rendering. */
export function validateComposition(
	c: Pick<CompositionInfo, "id" | "width" | "height" | "fps" | "durationInFrames">,
): void {
	const problems: string[] = [];
	if (!Number.isInteger(c.width) || c.width <= 0) problems.push(`width ${c.width}`);
	if (!Number.isInteger(c.height) || c.height <= 0) problems.push(`height ${c.height}`);
	if (!(Number.isFinite(c.fps) && c.fps > 0)) problems.push(`fps ${c.fps}`);
	if (!Number.isInteger(c.durationInFrames) || c.durationInFrames <= 0) {
		problems.push(`durationInFrames ${c.durationInFrames}`);
	}
	if (problems.length) {
		throw new MotioError(
			"E_INVALID_COMPOSITION",
			`Composition "${c.id}" has invalid metadata (${problems.join(", ")}): width and height must be positive integers, fps positive and durationInFrames a positive integer.`,
			{ composition: c.id },
		);
	}
}

/** Builds the public composition description. */
export function toVideoConfig(
	c: CompositionInfo | ResolvedComposition,
	props: Record<string, unknown>,
): VideoConfig {
	validateComposition(c);
	// Optional in newer protocol revisions; absent means null.
	const extra = c as { defaultProResProfile?: string | null; defaultSampleRate?: number | null };
	return {
		id: c.id,
		width: c.width,
		height: c.height,
		fps: c.fps,
		durationInFrames: c.durationInFrames,
		defaultProps: c.defaultProps,
		props: "props" in c ? c.props : props,
		defaultCodec: c.defaultCodec,
		defaultOutName: c.defaultOutName,
		defaultVideoImageFormat: c.defaultVideoImageFormat,
		defaultPixelFormat: c.defaultPixelFormat,
		defaultProResProfile: extra.defaultProResProfile ?? null,
		defaultSampleRate: extra.defaultSampleRate ?? null,
	};
}

/** Opens a page that only lists compositions (no viewport size known yet). */
export function openListingPage(session: BrowserSession): Promise<RenderPage> {
	// Listing captures nothing, so it never needs the BeginFrame launch.
	return RenderPage.open({
		...session.pageConfig({ width: 1280, height: 720, scale: 1, transparent: false }),
		captureMethod: "screenshot",
	});
}

/** Default props merged with input props, shallowly, as the props a composition receives. */
export function mergeProps(
	defaultProps: Record<string, unknown>,
	inputProps: Record<string, unknown>,
): Record<string, unknown> {
	return { ...defaultProps, ...inputProps };
}
