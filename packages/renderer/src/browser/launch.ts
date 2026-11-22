import puppeteer, { type Browser } from "puppeteer-core";
import { MotioError } from "../errors.js";
import { type ChromiumOptions, chromeArgs } from "./flags.js";

/** Options for launching one browser process. */
export interface LaunchOptions {
	executablePath: string;
	chromiumOptions?: ChromiumOptions;
	/** Initial window size; pages set their own viewport. */
	width: number;
	height: number;
}

/** Launches one browser process with the determinism flags. */
export async function launchBrowser(options: LaunchOptions): Promise<Browser> {
	const args = [
		...chromeArgs(options.chromiumOptions),
		`--window-size=${options.width},${options.height}`,
	];
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
