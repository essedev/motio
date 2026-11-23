import puppeteer, { type Browser } from "puppeteer-core";
import { MotioError } from "../errors.js";
import { BEGIN_FRAME_FLAGS, type ChromiumOptions, chromeArgs } from "./flags.js";

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
}

/** Chrome's command line for a launch. */
export function launchArgs(options: LaunchOptions): string[] {
	const base = chromeArgs(options.chromiumOptions, { transparent: options.transparent === true });
	if (!options.beginFrame) return [...base, `--window-size=${options.width},${options.height}`];
	const scale = `--force-device-scale-factor=${options.beginFrame.scale}`;
	const args = base.map((a) => (a.startsWith("--force-device-scale-factor=") ? scale : a));
	for (const f of BEGIN_FRAME_FLAGS) if (!args.includes(f)) args.push(f);
	args.push(`--window-size=${options.width},${options.height}`);
	return args;
}

/** Launches one browser process with the determinism flags. */
export async function launchBrowser(options: LaunchOptions): Promise<Browser> {
	const args = launchArgs(options);
	try {
		return await puppeteer.launch({
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
}
