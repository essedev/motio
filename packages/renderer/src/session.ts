import type { CompositionInfo, ResolvedComposition } from "@motiojs/core/protocol";
import { ensureBrowser } from "./browser/ensure.js";
import type { ChromiumOptions } from "./browser/flags.js";
import type { BrowserLog } from "./browser-log.js";
import {
	type CaptureMethod,
	type CaptureMethodOption,
	resolveCaptureMethod,
} from "./capture-method.js";
import { MotioError } from "./errors.js";
import { resolveFfmpegPath, resolveFfprobePath } from "./ffmpeg.js";
import { type MediaServer, startMediaServer } from "./media-server.js";
import { resolveEnvVariables, resolveInputProps, resolveTimeout } from "./options.js";
import { type PageConfig, RenderPage } from "./render-page.js";
import { openServeUrl, type StaticServer } from "./server.js";

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
	/** Port of the local bundle server; random if unset. */
	port?: number | null;
	onBrowserLog?: (log: BrowserLog) => void;
	/** Accepted for compatibility; the renderer logs through `onBrowserLog` and errors. */
	logLevel?: "trace" | "verbose" | "info" | "warn" | "error";
	/** Motio extension: FFmpeg executable. Default `$MOTIO_FFMPEG`, else `ffmpeg` on PATH. */
	ffmpegExecutable?: string | null;
	/**
	 * Motio extension: FFprobe executable. Default `$MOTIO_FFPROBE`, else `ffprobe` next to the
	 * FFmpeg executable.
	 */
	ffprobeExecutable?: string | null;
	/**
	 * Motio extension: how frames are captured (D-013). `auto` (the default, or
	 * `$MOTIO_CAPTURE_METHOD`) uses BeginFrame on Linux when a start-up probe succeeds and
	 * `Page.captureScreenshot` otherwise; `begin-frame` and `screenshot` force a path.
	 */
	captureMethod?: CaptureMethodOption | null;
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
	pageConfig(size: {
		width: number;
		height: number;
		scale: number;
		transparent: boolean;
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
	const chromiumOptions = options.chromiumOptions ?? {};
	const executablePath =
		options.browserExecutable ??
		process.env.MOTIO_BROWSER_EXECUTABLE ??
		(await ensureBrowser()).executablePath;
	const captureMethod: CaptureMethod = capture
		? await resolveCaptureMethod(options.captureMethod, executablePath, chromiumOptions)
		: "screenshot";
	const server = await openServeUrl(options.serveUrl, options.port ?? undefined);
	const ffmpeg = resolveFfmpegPath(options.ffmpegExecutable);
	const ffprobe = resolveFfprobePath(options.ffprobeExecutable, ffmpeg);
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
		pageConfig: (size) => ({
			executablePath,
			serveUrl: server.url,
			chromiumOptions,
			inputProps,
			envVariables,
			timeoutInMilliseconds,
			onBrowserLog,
			mediaBaseUrl: media.url,
			captureMethod,
			...size,
		}),
		close: async () => {
			await Promise.all([server.close(), media.close()]);
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
