import { spawn } from "node:child_process";
import { constants, existsSync, readdirSync } from "node:fs";
import { access } from "node:fs/promises";
import { join } from "node:path";
import type { CompatibilityReport } from "@motiojs/compat";
import { Flags, parseCommandArgs } from "../args.js";
import type { CommandContext, CommandResult } from "../context.js";
import { EXIT, toErrorJson, usageError } from "../errors.js";
import { BASE_FLAGS } from "../flags.js";
import { resolvePath } from "../options.js";

export const DOCTOR_FLAGS = {
	...BASE_FLAGS,
	config: { type: "string", description: "Path to the config file (default remotion.config.ts)." },
	"browser-executable": {
		type: "string",
		description: "Check this Chrome instead of the pinned one.",
	},
} as const;

export type CheckStatus = "pass" | "warn" | "fail";

export interface DoctorCheck {
	name: string;
	status: CheckStatus;
	message: string;
	details: Record<string, unknown>;
}

/** Minimum FFmpeg release, used when the renderer does not export its own. */
const FALLBACK_MIN_FFMPEG: readonly [number, number] = [5, 1];
/** Encoders the M1 renderer needs. */
const REQUIRED_ENCODERS = ["libx264"];

function run(command: string, args: string[]): Promise<{ code: number | null; output: string }> {
	return new Promise((resolve) => {
		const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
		let output = "";
		child.stdout.on("data", (chunk: Buffer) => {
			output += chunk.toString();
		});
		child.stderr.on("data", (chunk: Buffer) => {
			output += chunk.toString();
		});
		child.on("error", (error) => resolve({ code: null, output: error.message }));
		child.on("close", (code) => resolve({ code, output }));
	});
}

/** Parses `ffmpeg version 8.1.2 ...` (also `n7.1`). */
export function parseFfmpegRelease(text: string): {
	version: string;
	release: [number, number] | null;
} {
	const version = /(?:ffmpeg|ffprobe) version (\S+)/.exec(text)?.[1] ?? "unknown";
	const match = /^n?(\d+)\.(\d+)/.exec(version);
	return { version, release: match ? [Number(match[1]), Number(match[2])] : null };
}

async function checkFfmpeg(ctx: CommandContext): Promise<DoctorCheck[]> {
	const checks: DoctorCheck[] = [];
	const ffmpeg = await run(ctx.ffmpegPath, ["-hide_banner", "-version"]);
	if (ffmpeg.code !== 0) {
		checks.push({
			name: "ffmpeg",
			status: "fail",
			message: `FFmpeg was not found at "${ctx.ffmpegPath}". Install FFmpeg (brew install ffmpeg, apt install ffmpeg) or set MOTIO_FFMPEG.`,
			details: { path: ctx.ffmpegPath },
		});
	} else {
		const { version, release } = parseFfmpegRelease(ffmpeg.output);
		const fromRenderer = await ctx.renderer().then(
			(renderer) => renderer.MIN_FFMPEG_VERSION,
			() => undefined,
		);
		const [minMajor, minMinor] = fromRenderer ?? FALLBACK_MIN_FFMPEG;
		const tooOld =
			release !== null &&
			(release[0] < minMajor || (release[0] === minMajor && release[1] < minMinor));
		const encoders = await run(ctx.ffmpegPath, ["-hide_banner", "-encoders"]);
		const missing = REQUIRED_ENCODERS.filter(
			(name) => !new RegExp(`\\s${name}\\s`).test(encoders.output),
		);
		checks.push({
			name: "ffmpeg",
			status: tooOld || missing.length > 0 ? "fail" : "pass",
			message: tooOld
				? `FFmpeg ${version} is too old; Motio needs ${minMajor}.${minMinor} or later.`
				: missing.length > 0
					? `FFmpeg ${version} lacks the ${missing.join(", ")} encoder(s).`
					: `FFmpeg ${version} with ${REQUIRED_ENCODERS.join(", ")}.`,
			details: { path: ctx.ffmpegPath, version, missingEncoders: missing },
		});
	}
	const ffprobePath = ctx.ffmpegPath.replace(/ffmpeg(\.exe)?$/, "ffprobe$1");
	const ffprobe = await run(ffprobePath, ["-hide_banner", "-version"]);
	checks.push({
		name: "ffprobe",
		status: ffprobe.code === 0 ? "pass" : "warn",
		message:
			ffprobe.code === 0
				? `ffprobe ${parseFfmpegRelease(ffprobe.output).version}.`
				: `ffprobe was not found at "${ffprobePath}"; it is needed for media probing (M3).`,
		details: { path: ffprobePath },
	});
	return checks;
}

async function checkBrowser(
	ctx: CommandContext,
	executable: string | undefined,
): Promise<DoctorCheck> {
	if (executable) {
		const path = resolvePath(ctx.io.cwd, executable);
		try {
			await access(path, constants.X_OK);
			return {
				name: "browser",
				status: "warn",
				message: `Using ${path}; pixels are only guaranteed identical with the pinned chrome-headless-shell.`,
				details: { path },
			};
		} catch {
			return {
				name: "browser",
				status: "fail",
				message: `${path} is not executable.`,
				details: { path },
			};
		}
	}
	try {
		const renderer = await ctx.renderer();
		const version = renderer.CHROME_VERSION;
		const cacheDir = renderer.defaultBrowserCacheDir?.();
		if (!version || !cacheDir) {
			return {
				name: "browser",
				status: "warn",
				message: "Could not determine the pinned browser; run `motio browser ensure`.",
				details: {},
			};
		}
		const installed = findInstalled(cacheDir, version);
		return installed
			? {
					name: "browser",
					status: "pass",
					message: `chrome-headless-shell ${version} is installed.`,
					details: { cacheDir, version, path: installed },
				}
			: {
					name: "browser",
					status: "warn",
					message: `chrome-headless-shell ${version} is not downloaded yet: run \`motio browser ensure\` (renders download it on first use).`,
					details: { cacheDir, version },
				};
	} catch (error) {
		return { name: "browser", status: "warn", message: toErrorJson(error).message, details: {} };
	}
}

/** Looks for a directory named after the pinned version in the browser cache. */
function findInstalled(cacheDir: string, version: string): string | null {
	const base = join(cacheDir, "chrome-headless-shell");
	if (!existsSync(base)) return null;
	const match = readdirSync(base).find((entry) => entry.endsWith(version));
	return match ? join(base, match) : null;
}

function nodeCheck(): DoctorCheck {
	const [major = 0] = process.versions.node.split(".").map(Number);
	return {
		name: "node",
		status: major >= 22 ? "pass" : "fail",
		message:
			major >= 22
				? `Node ${process.versions.node}.`
				: `Node ${process.versions.node}; Motio needs 22 or later.`,
		details: { version: process.versions.node },
	};
}

function compatibilityCheck(report: CompatibilityReport): DoctorCheck {
	const blocking =
		report.summary.missing +
		report.summary["unknown-symbol"] +
		report.summary["unsupported-package"] +
		report.summary["unknown-package"];
	const used = report.entries.length;
	return {
		name: "compatibility",
		status:
			blocking > 0 ? "fail" : report.summary.stubbed + report.summary.opaque > 0 ? "warn" : "pass",
		message:
			used === 0
				? "No imports from remotion or @remotion/* found."
				: blocking > 0
					? `${blocking} of ${used} Remotion symbols used are not available in Motio (target ${report.target}).`
					: `All ${used} Remotion symbols used are available (target ${report.target}).`,
		details: { summary: report.summary, filesScanned: report.filesScanned },
	};
}

/** `motio doctor [project-dir]`: environment checks and the compatibility report. */
export async function doctorCommand(
	ctx: CommandContext,
	argv: readonly string[],
): Promise<CommandResult> {
	const { positionals, values } = parseCommandArgs(argv, DOCTOR_FLAGS);
	const flags = new Flags(values);
	if (positionals.length > 1) throw usageError(`Too many arguments: ${positionals.join(" ")}.`);
	const rootDir = resolvePath(ctx.io.cwd, positionals[0] ?? ".");

	const checks: DoctorCheck[] = [nodeCheck(), ...(await checkFfmpeg(ctx))];
	checks.push(await checkBrowser(ctx, flags.string("browser-executable")));

	try {
		const loaded = await ctx.bundler.loadRemotionConfig({
			rootDir,
			configFile: flags.string("config"),
		});
		const webpack = loaded.warnings.filter(
			(w) => w.setter === "overrideWebpackConfig" || w.setter === "overrideBundlerConfig",
		);
		checks.push({
			name: "config",
			status: loaded.warnings.length > 0 ? "warn" : "pass",
			message: !loaded.file
				? "No remotion.config.ts; defaults apply."
				: loaded.warnings.length > 0
					? `${loaded.file}: ${loaded.warnings.length} setting(s) without full effect in Motio${webpack.length > 0 ? ", including a webpack override (D-003)" : ""}.`
					: `${loaded.file} loaded.`,
			details: { file: loaded.file, warnings: loaded.warnings },
		});
		try {
			const entry = ctx.bundler.resolveEntryPoint({
				rootDir,
				configEntryPoint: loaded.values.entryPoint,
			});
			checks.push({
				name: "entry-point",
				status: "pass",
				message: `Entry point ${entry.path}.`,
				details: { path: entry.path, reason: entry.reason },
			});
		} catch (error) {
			checks.push({
				name: "entry-point",
				status: "warn",
				message: toErrorJson(error).message,
				details: {},
			});
		}
	} catch (error) {
		checks.push({
			name: "config",
			status: "fail",
			message: toErrorJson(error).message,
			details: toErrorJson(error).context,
		});
	}

	const report = await ctx.compatibilityReport(rootDir);
	checks.push(compatibilityCheck(report));

	const failed = checks.some((check) => check.status === "fail");
	const icon: Record<CheckStatus, string> = { pass: "ok  ", warn: "warn", fail: "FAIL" };
	const human = checks.map((check) => `${icon[check.status]}  ${check.name}: ${check.message}`);
	const blocking = report.entries.filter((entry) =>
		["missing", "unknown-symbol", "unsupported-package", "unknown-package"].includes(entry.status),
	);
	if (blocking.length > 0) {
		human.push("", "Not available in Motio:");
		for (const entry of blocking) {
			const where = entry.locations[0];
			human.push(
				`  ${entry.symbol} from ${entry.specifier} (${entry.status}${entry.tier ? `, Tier ${entry.tier}` : ""})${where ? ` ${where.file}:${where.line}` : ""}`,
			);
		}
	}
	return {
		json: { healthy: !failed, checks, compatibility: report },
		human,
		exitCode: failed ? EXIT.checkFailed : EXIT.ok,
	};
}
