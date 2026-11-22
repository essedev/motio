import { homedir } from "node:os";
import { join } from "node:path";
import {
	Browser,
	BrowserPlatform,
	computeExecutablePath,
	detectBrowserPlatform,
	getInstalledBrowsers,
	install,
} from "@puppeteer/browsers";
import { MotioError } from "../errors.js";
import { CHROME_ARCHIVE_SHA256, CHROME_VERSION, type ChromePlatform } from "./pinned.js";

/** Options of `ensureBrowser()`. */
export interface EnsureBrowserOptions {
	/**
	 * Where browsers are cached. Default: `$MOTIO_BROWSER_CACHE`, else `~/.cache/motio/browsers`.
	 */
	cacheDir?: string;
	/** Called while the archive downloads. */
	onProgress?: (progress: { downloadedBytes: number; totalBytes: number }) => void;
}

/** The browser `ensureBrowser()` found or installed. */
export interface EnsuredBrowser {
	executablePath: string;
	version: string;
	platform: ChromePlatform;
	cacheDir: string;
	/** True if this call downloaded the browser, false if it was already cached. */
	downloaded: boolean;
}

/** Default browser cache directory. */
export function defaultBrowserCacheDir(): string {
	return process.env.MOTIO_BROWSER_CACHE ?? join(homedir(), ".cache", "motio", "browsers");
}

const PLATFORMS: Partial<Record<BrowserPlatform, ChromePlatform>> = {
	[BrowserPlatform.MAC_ARM]: "mac-arm64",
	[BrowserPlatform.MAC]: "mac-x64",
	[BrowserPlatform.LINUX]: "linux64",
	[BrowserPlatform.LINUX_ARM]: "linux-arm64",
};

function detectPlatform(): { browserPlatform: BrowserPlatform; platform: ChromePlatform } {
	const browserPlatform = detectBrowserPlatform();
	const platform = browserPlatform === undefined ? undefined : PLATFORMS[browserPlatform];
	if (browserPlatform === undefined || platform === undefined) {
		throw new MotioError(
			"E_BROWSER_UNSUPPORTED_PLATFORM",
			`Rendering is supported on macOS and Linux (x64 and arm64), not on ${process.platform} ${process.arch}. Pass browserExecutable to use your own Chrome at your own risk.`,
			{ details: { platform: process.platform, arch: process.arch } },
		);
	}
	return { browserPlatform, platform };
}

/**
 * Makes sure the pinned `chrome-headless-shell` is installed and returns its executable. Downloads
 * it from Chrome for Testing on first use and verifies the archive against the SHA-256 digest
 * committed in this package before unpacking it.
 */
export async function ensureBrowser(options: EnsureBrowserOptions = {}): Promise<EnsuredBrowser> {
	const cacheDir = options.cacheDir ?? defaultBrowserCacheDir();
	const { browserPlatform, platform } = detectPlatform();
	const executablePath = computeExecutablePath({
		cacheDir,
		browser: Browser.CHROMEHEADLESSSHELL,
		buildId: CHROME_VERSION,
		platform: browserPlatform,
	});
	const installed = await getInstalledBrowsers({ cacheDir });
	const cached = installed.some(
		(b) =>
			b.browser === Browser.CHROMEHEADLESSSHELL &&
			b.buildId === CHROME_VERSION &&
			b.platform === browserPlatform,
	);
	if (cached)
		return { executablePath, version: CHROME_VERSION, platform, cacheDir, downloaded: false };
	const onProgress = options.onProgress;
	try {
		const result = await install({
			cacheDir,
			browser: Browser.CHROMEHEADLESSSHELL,
			buildId: CHROME_VERSION,
			platform: browserPlatform,
			expectedHash: CHROME_ARCHIVE_SHA256[platform],
			...(onProgress
				? {
						downloadProgressCallback: (downloadedBytes: number, totalBytes: number) =>
							onProgress({ downloadedBytes, totalBytes }),
					}
				: {}),
		});
		return {
			executablePath: result.executablePath,
			version: CHROME_VERSION,
			platform,
			cacheDir,
			downloaded: true,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes("Integrity check failed")) {
			throw new MotioError(
				"E_BROWSER_CHECKSUM",
				`The downloaded chrome-headless-shell ${CHROME_VERSION} archive for ${platform} does not match the committed SHA-256 digest, so it was discarded. Retry; if it persists, the archive changed upstream and must be investigated before use.`,
				{ details: { platform, expected: CHROME_ARCHIVE_SHA256[platform], cacheDir } },
				err,
			);
		}
		throw new MotioError(
			"E_BROWSER_DOWNLOAD",
			`Could not install chrome-headless-shell ${CHROME_VERSION} into ${cacheDir}: ${message}. Check the network and that the directory is writable, or pass browserExecutable.`,
			{ details: { platform, cacheDir } },
			err,
		);
	}
}
