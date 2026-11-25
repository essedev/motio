import type { ChildProcess } from "node:child_process";
import puppeteer, { type Browser } from "puppeteer-core";
import { MotioError } from "../errors.js";
import {
	BEGIN_FRAME_FLAGS,
	type CanvasMode,
	type ChromiumOptions,
	chromeArgs,
	type RasterMode,
} from "./flags.js";

/** Options for launching one browser process. */
export interface LaunchOptions {
	executablePath: string;
	chromiumOptions?: ChromiumOptions;
	/** Initial window size; pages set their own viewport. */
	width: number;
	height: number;
	/**
	 * Launch for BeginFrame capture (D-013) at this device scale factor: BeginFrame screenshots
	 * ignore the emulated scale factor, so the browser itself runs at the output scale.
	 */
	beginFrame?: { scale: number };
	/** The pages capture with a transparent background, which selects the compositing (D-041). */
	transparent?: boolean;
	/** The render's `raster` option; unset, `resolveRasterMode` decides from the GL backend. */
	raster?: RasterMode | null;
	/** The render's `canvas` option; unset, canvases are drawn in software with software GL. */
	canvas?: CanvasMode | null;
	/**
	 * The render's locale, as `--accept-lang`: the language dedicated workers report in
	 * `navigator.language`, which the page's own overrides do not reach (`--lang` and `LANG` do
	 * not either, on macOS).
	 */
	locale?: string;
}

/** Chrome's command line for a launch. */
export function launchArgs(options: LaunchOptions): string[] {
	const base = chromeArgs(options.chromiumOptions, {
		transparent: options.transparent === true,
		raster: options.raster ?? null,
		canvas: options.canvas ?? null,
	});
	if (options.locale !== undefined) base.push(`--accept-lang=${options.locale}`);
	if (!options.beginFrame) return [...base, `--window-size=${options.width},${options.height}`];
	const scale = `--force-device-scale-factor=${options.beginFrame.scale}`;
	const args = base.map((a) => (a.startsWith("--force-device-scale-factor=") ? scale : a));
	for (const f of BEGIN_FRAME_FLAGS) if (!args.includes(f)) args.push(f);
	args.push(`--window-size=${options.width},${options.height}`);
	return args;
}

/** Browser processes launched by this module and still running. */
const live = new Set<ChildProcess>();

/** Signals after which the browsers would outlive the process unless killed here. */
const SIGNALS: readonly NodeJS.Signals[] = ["SIGTERM", "SIGINT", "SIGHUP"];

/** Kills every live browser now, synchronously: the process is exiting. */
function killLiveBrowsers(): void {
	for (const proc of live) {
		if (proc.pid === undefined) continue;
		try {
			// The browser leads its own process group (it is launched detached): kill the group, so
			// its renderer and GPU processes go too.
			process.kill(process.platform === "win32" ? proc.pid : -proc.pid, "SIGKILL");
		} catch {
			// ESRCH: the group is gone already. Anything else: fall back to the process itself.
			proc.kill("SIGKILL");
		}
	}
	live.clear();
}

/**
 * A signal arrived. When this is the only listener, the process would end with the signal's
 * default action and leave the browsers running, since they are detached (vitest stops its
 * workers with SIGTERM, a terminal sends SIGINT): they are killed, and the signal is raised again
 * for its default action. When the host listens too (the CLI cancels its render on Ctrl+C), the
 * host decides; the exit handler still kills what is left if it exits.
 */
function onSignal(signal: NodeJS.Signals): void {
	if (process.listenerCount(signal) > 1) return;
	killLiveBrowsers();
	uninstallExitHandlers();
	process.kill(process.pid, signal);
}

let handlersInstalled = false;

function installExitHandlers(): void {
	if (handlersInstalled) return;
	handlersInstalled = true;
	process.on("exit", killLiveBrowsers);
	for (const signal of SIGNALS) process.on(signal, onSignal);
}

function uninstallExitHandlers(): void {
	if (!handlersInstalled) return;
	handlersInstalled = false;
	process.off("exit", killLiveBrowsers);
	for (const signal of SIGNALS) process.off(signal, onSignal);
}

/**
 * Tracks a launched browser until its process exits, so it is killed when this process exits or
 * is stopped by a signal. Puppeteer's own exit handling is turned off (it would call
 * `process.exit()` on Ctrl+C) and did not reliably kill every browser on `process.exit()`.
 */
export function trackBrowserProcess(proc: ChildProcess | null): void {
	if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
	live.add(proc);
	installExitHandlers();
	proc.once("exit", () => {
		live.delete(proc);
		if (live.size === 0) uninstallExitHandlers();
	});
}

/** Browser processes tracked right now, for tests. */
export function liveBrowserCount(): number {
	return live.size;
}

/** Launches one browser process with the determinism flags. */
export async function launchBrowser(options: LaunchOptions): Promise<Browser> {
	const args = launchArgs(options);
	let browser: Browser;
	try {
		browser = await puppeteer.launch({
			executablePath: options.executablePath,
			headless: options.chromiumOptions?.headless ?? true,
			args,
			defaultViewport: null,
			handleSIGINT: false,
			handleSIGTERM: false,
			handleSIGHUP: false,
		});
	} catch (err) {
		throw new MotioError(
			"E_BROWSER_LAUNCH",
			`Could not start the browser at ${options.executablePath}: ${err instanceof Error ? err.message : String(err)}. Run "motio browser ensure" or check browserExecutable.`,
			{ details: { executablePath: options.executablePath, args } },
			err,
		);
	}
	trackBrowserProcess(browser.process());
	return browser;
}
