import type { ChromiumOptions } from "./browser/flags.js";
import { launchArgs, launchBrowser } from "./browser/launch.js";
import { MotioError } from "./errors.js";

/**
 * How frames are captured (D-013). `begin-frame` drives the compositor with
 * `HeadlessExperimental.beginFrame` and takes the screenshot from that frame; `screenshot` uses
 * `Page.captureScreenshot`, which works everywhere and is the reference path.
 */
export type CaptureMethod = "begin-frame" | "screenshot";

/** The `captureMethod` option: a method, or `auto` to probe for BeginFrame at start-up. */
export type CaptureMethodOption = CaptureMethod | "auto";

export const CAPTURE_METHODS = ["auto", "begin-frame", "screenshot"] as const;

/** Attempts at a BeginFrame screenshot: the first frames after a navigation can carry none. */
export const BEGIN_FRAME_ATTEMPTS = 10;

/** Result of `probeBeginFrame()`. */
export interface BeginFrameProbe {
	supported: boolean;
	/** Why BeginFrame is not usable, when it is not. */
	reason?: string;
}

const probes = new Map<string, Promise<BeginFrameProbe>>();

const PROBE_PAGE = `data:text/html,${encodeURIComponent(
	'<body style="margin:0;background:#00ff00"></body>',
)}`;

/**
 * Launches the browser once with the BeginFrame flags and checks that a BeginFrame returns a
 * screenshot showing the page. Cached per executable and Chrome options for the process.
 */
export function probeBeginFrame(
	executablePath: string,
	chromiumOptions: ChromiumOptions = {},
): Promise<BeginFrameProbe> {
	const key = JSON.stringify([
		executablePath,
		launchArgs({ executablePath, chromiumOptions, width: 64, height: 64 }),
	]);
	let probe = probes.get(key);
	if (!probe) {
		probe = runProbe(executablePath, chromiumOptions);
		probes.set(key, probe);
	}
	return probe;
}

async function runProbe(
	executablePath: string,
	chromiumOptions: ChromiumOptions,
): Promise<BeginFrameProbe> {
	let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
	try {
		browser = await launchBrowser({
			executablePath,
			chromiumOptions,
			width: 64,
			height: 64,
			beginFrame: { scale: 1 },
		});
		const page = (await browser.pages())[0] ?? (await browser.newPage());
		const cdp = await page.createCDPSession();
		await cdp.send("Emulation.setDeviceMetricsOverride", {
			width: 64,
			height: 64,
			deviceScaleFactor: 1,
			mobile: false,
		});
		await withTimeout(page.goto(PROBE_PAGE, { waitUntil: "load" }), 10_000, "loading the page");
		for (let i = 0; i < BEGIN_FRAME_ATTEMPTS; i++) {
			const res = await withTimeout(
				cdp.send("HeadlessExperimental.beginFrame", { screenshot: { format: "png" } }),
				5_000,
				"a BeginFrame",
			);
			if (res.screenshotData) {
				const png = Buffer.from(res.screenshotData, "base64");
				const ok = png.length > 24 && png.readUInt32BE(16) === 64 && png.readUInt32BE(20) === 64;
				return ok
					? { supported: true }
					: { supported: false, reason: "the BeginFrame screenshot has the wrong size" };
			}
		}
		return {
			supported: false,
			reason: `no BeginFrame returned a screenshot in ${BEGIN_FRAME_ATTEMPTS} attempts`,
		};
	} catch (err) {
		return { supported: false, reason: err instanceof Error ? err.message : String(err) };
	} finally {
		if (browser) {
			const proc = browser.process();
			await Promise.race([
				browser.close().catch(() => undefined),
				new Promise((ok) => setTimeout(ok, 3_000)),
			]);
			if (proc && proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL");
		}
	}
}

function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
	let timer: NodeJS.Timeout | undefined;
	return Promise.race([
		work,
		new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new Error(`${what} did not finish within ${ms} ms`)), ms);
		}),
	]).finally(() => clearTimeout(timer));
}

/**
 * Resolves `captureMethod`: the option, else `$MOTIO_CAPTURE_METHOD`, else `auto`. `auto` uses
 * BeginFrame on Linux when the probe succeeds and the screenshot path otherwise; an explicit
 * `begin-frame` fails with `E_BEGIN_FRAME_UNSUPPORTED` when the probe fails.
 */
export async function resolveCaptureMethod(
	option: CaptureMethodOption | null | undefined,
	executablePath: string,
	chromiumOptions: ChromiumOptions,
	platform: NodeJS.Platform = process.platform,
	probe: typeof probeBeginFrame = probeBeginFrame,
): Promise<CaptureMethod> {
	const fromEnv = process.env.MOTIO_CAPTURE_METHOD?.trim() || undefined;
	const value = option ?? (fromEnv as CaptureMethodOption | undefined);
	if (value === undefined || value === "auto") {
		if (platform !== "linux") return "screenshot";
		return (await probe(executablePath, chromiumOptions)).supported ? "begin-frame" : "screenshot";
	}
	if (!(CAPTURE_METHODS as readonly string[]).includes(value)) {
		throw new MotioError(
			"E_INVALID_OPTION",
			`captureMethod must be one of ${CAPTURE_METHODS.join(", ")}, got ${JSON.stringify(value)}.`,
		);
	}
	if (value === "screenshot") return "screenshot";
	const result = await probe(executablePath, chromiumOptions);
	if (!result.supported) {
		throw new MotioError(
			"E_BEGIN_FRAME_UNSUPPORTED",
			`BeginFrame capture is not available with the browser at ${executablePath}: ${result.reason ?? "unknown reason"}. It works with chrome-headless-shell on Linux; use captureMethod "screenshot" or "auto".`,
			{ details: { executablePath, platform, reason: result.reason } },
		);
	}
	return "begin-frame";
}
