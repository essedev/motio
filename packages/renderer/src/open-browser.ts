import { BrowserPool } from "./browser/browser-pool.js";
import { ensureBrowser } from "./browser/ensure.js";
import type { ChromiumOptions } from "./browser/flags.js";
import { type LaunchOptions, launchBrowser } from "./browser/launch.js";
import { MotioError } from "./errors.js";
import { checkLogLevel } from "./media-file.js";
import type { LogLevel } from "./options.js";
import { DEFAULT_LOCALE } from "./options.js";
import { browserPoolKey } from "./render-page.js";

/** Which Chrome build to run, as Remotion's `chromeMode`. */
export type ChromeMode = "headless-shell" | "chrome-for-testing";

/** Options of `openBrowser()`. */
export interface OpenBrowserOptions {
	/** Accepted for compatibility; browser output reaches renders through `onBrowserLog`. */
	logLevel?: LogLevel;
	/** Deprecated in Remotion in favour of `logLevel`; accepted and ignored. */
	shouldDumpIo?: boolean;
	/** Use this browser instead of the pinned `chrome-headless-shell`. */
	browserExecutable?: string | null;
	/**
	 * Browser options. They are fixed when the browser starts: renders given this browser as
	 * `puppeteerInstance` use these and ignore their own `chromiumOptions`.
	 */
	chromiumOptions?: ChromiumOptions;
	/**
	 * `headless-shell` (default) runs the pinned `chrome-headless-shell`. Motio does not download
	 * Chrome for Testing: `chrome-for-testing` needs `browserExecutable`.
	 */
	chromeMode?: ChromeMode;
	/**
	 * Accepted for compatibility. Motio sets the scale per page, so a browser opened without it
	 * renders at any `scale`.
	 */
	forceDeviceScaleFactor?: number;
}

/** Options of `HeadlessBrowser.close()`. */
export interface CloseBrowserOptions {
	/** Resolve instead of throwing when the browser is already closed. Default false. */
	silent?: boolean;
}

/**
 * A browser opened by `openBrowser()`, to pass as `puppeteerInstance` to `renderMedia`,
 * `renderStill`, `renderFrames`, `selectComposition` and `getCompositions`. Despite the option's
 * name it is not a Puppeteer `Browser`.
 */
export interface HeadlessBrowser {
	/** Whether `close()` was called. */
	readonly closed: boolean;
	/**
	 * Kills every browser process this instance started and resolves when they have exited.
	 * Throws `E_BROWSER_CLOSED` if it is already closed, unless `silent` is true. A render still
	 * using the browser fails.
	 */
	close(options?: CloseBrowserOptions): Promise<void>;
}

/** What a render reads from a `HeadlessBrowser`. */
export interface SharedBrowsers {
	executablePath: string;
	chromiumOptions: ChromiumOptions;
	/** The browser processes, kept across renders until `close()`. */
	pool: BrowserPool;
	readonly closed: boolean;
}

const instances = new WeakMap<object, SharedBrowsers>();

/**
 * The browsers behind a `puppeteerInstance`. Throws `E_INVALID_OPTION` for anything
 * `openBrowser()` did not return and `E_BROWSER_CLOSED` for a closed one.
 */
export function sharedBrowsers(instance: unknown): SharedBrowsers {
	const shared =
		typeof instance === "object" && instance !== null ? instances.get(instance) : undefined;
	if (!shared) {
		throw new MotioError(
			"E_INVALID_OPTION",
			"puppeteerInstance must be a browser returned by openBrowser(); a Puppeteer Browser is not accepted.",
		);
	}
	if (shared.closed) {
		throw new MotioError(
			"E_BROWSER_CLOSED",
			"The browser passed as puppeteerInstance was closed. Open a new one with openBrowser().",
		);
	}
	return shared;
}

/** Window size of the browser started by `openBrowser()`; pages set their own viewport. */
const INITIAL_WINDOW = { width: 1280, height: 720 };

/**
 * Starts Chrome once for many renders: pass the result as `puppeteerInstance` and every render
 * opens tabs on it instead of launching and killing a browser. Renders keep the layout of D-042
 * (a render's pages spread over two browser processes by default): the instance starts one
 * browser now and the others the first time a render needs them, then keeps them all until
 * `close()`. A crashed browser is replaced on the next render. Transparent captures (PNG with
 * alpha) composite differently from opaque ones (D-041), so they run on a browser of their own,
 * also started on first use.
 */
export async function openBrowser(
	browser: "chrome",
	options: OpenBrowserOptions = {},
): Promise<HeadlessBrowser> {
	if (browser !== "chrome") {
		throw new MotioError("E_INVALID_OPTION", `openBrowser() supports "chrome", got "${browser}"`);
	}
	checkLogLevel(options.logLevel);
	const chromeMode = options.chromeMode ?? "headless-shell";
	if (chromeMode !== "headless-shell" && chromeMode !== "chrome-for-testing") {
		throw new MotioError(
			"E_INVALID_OPTION",
			`chromeMode must be "headless-shell" or "chrome-for-testing", got "${chromeMode}"`,
		);
	}
	if (chromeMode === "chrome-for-testing" && !options.browserExecutable) {
		throw new MotioError(
			"E_INVALID_OPTION",
			'chromeMode "chrome-for-testing" needs browserExecutable: Motio downloads only the pinned chrome-headless-shell.',
		);
	}
	const scale = options.forceDeviceScaleFactor;
	if (scale !== undefined && !(typeof scale === "number" && Number.isFinite(scale) && scale > 0)) {
		throw new MotioError(
			"E_INVALID_OPTION",
			`forceDeviceScaleFactor must be a positive number, got ${String(scale)}`,
		);
	}
	const executablePath =
		options.browserExecutable ??
		process.env.MOTIO_BROWSER_EXECUTABLE ??
		(await ensureBrowser()).executablePath;
	const chromiumOptions = { ...(options.chromiumOptions ?? {}) };
	const pool = new BrowserPool();
	let closed = false;
	const shared: SharedBrowsers = {
		executablePath,
		chromiumOptions,
		pool,
		get closed() {
			return closed;
		},
	};
	// Start the browser opaque renders (videos, listing compositions) use, so a broken executable
	// fails here and the first render does not pay for the launch.
	const launch: LaunchOptions = {
		executablePath,
		chromiumOptions,
		...INITIAL_WINDOW,
		transparent: false,
		// Renders that leave the locale unset launch with this one, so they use this browser.
		locale: DEFAULT_LOCALE,
	};
	const lease = await pool.lease(browserPoolKey(launch), 1, () => launchBrowser(launch));
	lease.release();
	const handle: HeadlessBrowser = {
		get closed() {
			return closed;
		},
		async close(closeOptions: CloseBrowserOptions = {}) {
			if (closed) {
				if (closeOptions.silent) return;
				throw new MotioError("E_BROWSER_CLOSED", "The browser was already closed.");
			}
			closed = true;
			await pool.close();
		},
	};
	instances.set(handle, shared);
	return handle;
}
