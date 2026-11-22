import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { MotioError } from "@motiojs/compat";
import { CHROME_MODES } from "@motiojs/compat/config";
import { Flags, parseCommandArgs } from "../args.js";
import type { CommandContext, CommandResult } from "../context.js";
import { usageError } from "../errors.js";
import { BASE_FLAGS } from "../flags.js";
import { resolvePath } from "../options.js";

export const BROWSER_ENSURE_FLAGS = {
	...BASE_FLAGS,
	"browser-executable": {
		type: "string",
		description: "Check this Chrome instead of downloading.",
	},
	"chrome-mode": {
		type: "string",
		description: "Accepted for compatibility: headless-shell only.",
	},
} as const;

/** `motio browser ensure` */
export async function browserEnsureCommand(
	ctx: CommandContext,
	argv: readonly string[],
): Promise<CommandResult> {
	const { positionals, values } = parseCommandArgs(argv, BROWSER_ENSURE_FLAGS);
	const flags = new Flags(values);
	if (positionals.length > 0) throw usageError(`Unexpected arguments: ${positionals.join(" ")}.`);
	const mode = flags.oneOf("chrome-mode", CHROME_MODES);
	if (mode === "chrome-for-testing") {
		throw new MotioError(
			"E_UNSUPPORTED_OPTION",
			"Motio renders with the pinned chrome-headless-shell only; use --browser-executable for another Chrome.",
			{ option: "chrome-mode" },
		);
	}
	const executable = flags.string("browser-executable");
	if (executable) {
		const path = resolvePath(ctx.io.cwd, executable);
		try {
			await access(path, constants.X_OK);
		} catch {
			throw new MotioError("E_BROWSER_NOT_FOUND", `${path} does not exist or is not executable.`, {
				path,
			});
		}
		return {
			json: { executablePath: path, version: null, downloaded: false, source: "user" },
			human: [`Using ${path}`],
		};
	}
	const renderer = await ctx.renderer();
	const browser = await renderer.ensureBrowser({
		onProgress: ({ downloadedBytes, totalBytes }) =>
			ctx.reporter.progress(
				"Downloading chrome-headless-shell",
				totalBytes > 0 ? downloadedBytes / totalBytes : 0,
			),
	});
	return {
		json: {
			executablePath: browser.executablePath,
			version: browser.version ?? null,
			downloaded: browser.downloaded ?? false,
			source: "pinned",
		},
		human: [
			`${browser.downloaded ? "Downloaded" : "Found"} chrome-headless-shell${browser.version ? ` ${browser.version}` : ""} at ${browser.executablePath}`,
		],
	};
}
