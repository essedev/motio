import { spawn } from "node:child_process";
import { constants, existsSync, readdirSync } from "node:fs";
import { access } from "node:fs/promises";
import { join, relative } from "node:path";
import type { CompatibilityReport } from "@motiojs/compat";
import { Flags, parseCommandArgs } from "../args.js";
import { loadProjectConfig, type ProjectConfig } from "../config.js";
import type { CommandContext, CommandResult } from "../context.js";
import { EXIT, toErrorJson, usageError } from "../errors.js";
import { configFfmpegOptions, FFMPEG_SOURCE_LABELS } from "../ffmpeg.js";
import { BASE_FLAGS, PROJECT_FLAGS } from "../flags.js";
import { resolvePath } from "../options.js";
import type { ResolvedFfmpeg } from "../renderer-api.js";

export const DOCTOR_FLAGS = {
	...BASE_FLAGS,
	config: PROJECT_FLAGS.config,
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
/** Encoders every render needs (the default codec); a missing one fails the check. */
const REQUIRED_ENCODERS = ["libx264"];

/** Encoders of each video codec, used when the renderer does not load. */
const FALLBACK_CODEC_ENCODERS: Readonly<Record<string, readonly string[]>> = {
	h264: ["libx264"],
	h265: ["libx265"],
	vp8: ["libvpx"],
	vp9: ["libvpx-vp9"],
	av1: ["libsvtav1", "libaom-av1"],
	prores: ["prores_ks"],
	gif: ["gif"],
};

/**
 * Which encoder FFmpeg would use for each video codec (the first one it has), or null when it has
 * none of the codec's encoders.
 */
export function codecEncoders(
	available: ReadonlySet<string>,
	table: Readonly<Record<string, readonly string[]>>,
): Record<string, string | null> {
	const result: Record<string, string | null> = {};
	for (const [codec, encoders] of Object.entries(table)) {
		if (codec === "h264-mkv" || codec === "h264-ts") continue;
		result[codec] = encoders.find((e) => available.has(e)) ?? null;
	}
	return result;
}

/** Parses the codec list printed by `ffmpeg -encoders`: the names after the `------` line. */
export function parseEncoderList(text: string): Set<string> {
	const body = text.split(/^\s*-{6}\s*$/m)[1] ?? "";
	return new Set([...body.matchAll(/^\s*[A-Z.]{6}\s+(\S+)/gm)].map((m) => m[1] as string));
}

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

/**
 * A failed check when `@motiojs/ffmpeg` is installed but the archives of its pinned build are
 * not published, so it cannot be downloaded: the package is then a trap (every
 * `motio ffmpeg ensure` fails), and the fix is to remove it. Null when that is not the case.
 */
async function unpublishedPinnedBuild(
	ctx: CommandContext,
	resolved: ResolvedFfmpeg | null,
): Promise<DoctorCheck[] | null> {
	const renderer = await ctx.renderer().catch(() => undefined);
	const pkg = await renderer?.loadFfmpegPackage?.().catch(() => null);
	const unpublished =
		resolved?.fallback?.reason === "unpublished" ||
		(pkg?.archivesPublished !== undefined && !pkg.archivesPublished());
	if (!unpublished) return null;
	const build =
		pkg?.FFMPEG_VERSION !== undefined
			? ` ${pkg.FFMPEG_VERSION}${pkg.FFMPEG_BUILD !== undefined ? `-${pkg.FFMPEG_BUILD}` : ""}`
			: "";
	// What renders use meanwhile: the renderer falls back to the FFmpeg on PATH.
	const onPath = await run(resolved?.ffmpeg ?? "ffmpeg", ["-hide_banner", "-version"]);
	const fallback =
		onPath.code === 0
			? ` Renders use FFmpeg ${parseFfmpegRelease(onPath.output).version} from PATH meanwhile.`
			: " No FFmpeg on PATH either, so renders fail.";
	const message = `@motiojs/ffmpeg is installed, but the archives of its pinned FFmpeg${build} are not published yet, so it cannot be downloaded.${fallback} Fix: remove @motiojs/ffmpeg from the project's dependencies to use the system FFmpeg (brew install ffmpeg, apt install ffmpeg), or set MOTIO_FFMPEG to an FFmpeg executable.`;
	return [
		{
			name: "ffmpeg",
			status: "fail",
			message,
			details: { source: "package", reason: "unpublished", pathFfmpeg: onPath.code === 0 },
		},
		{
			name: "ffprobe",
			status: "warn",
			message: "Not checked: the pinned FFmpeg cannot be downloaded.",
			details: {},
		},
	];
}

async function checkFfmpeg(
	ctx: CommandContext,
	settings: ProjectConfig | undefined,
): Promise<DoctorCheck[]> {
	const checks: DoctorCheck[] = [];
	// Never downloads: doctor reports a pinned build that is not downloaded yet instead.
	let resolved: Awaited<ReturnType<CommandContext["resolveFfmpeg"]>>;
	try {
		resolved = await ctx.resolveFfmpeg({ download: false, ...configFfmpegOptions(ctx, settings) });
	} catch (error) {
		// For example @motiojs/ffmpeg installed on a platform it has no build for.
		const { code, message } = toErrorJson(error);
		return [
			{ name: "ffmpeg", status: "fail", message, details: { code } },
			{
				name: "ffprobe",
				status: "warn",
				message: "Not checked: FFmpeg could not be resolved.",
				details: {},
			},
		];
	}
	if (resolved === null || resolved.fallback) {
		const unpublished = await unpublishedPinnedBuild(ctx, resolved);
		if (unpublished) return unpublished;
	}
	if (resolved === null) {
		const message =
			"@motiojs/ffmpeg is installed but its FFmpeg is not downloaded yet: run `motio ffmpeg ensure` (renders download it on first use).";
		return [
			{ name: "ffmpeg", status: "warn", message, details: { source: "package" } },
			{ name: "ffprobe", status: "warn", message, details: { source: "package" } },
		];
	}
	const path = resolved.ffmpeg;
	const source = {
		source: resolved.source,
		...(resolved.pinned ? { pinned: resolved.pinned } : {}),
	};
	const from = `from ${FFMPEG_SOURCE_LABELS[resolved.source]}${resolved.pinned ? ` ${resolved.pinned.version}-${resolved.pinned.build}` : ""}`;
	const ffmpeg = await run(path, ["-hide_banner", "-version"]);
	if (ffmpeg.code !== 0) {
		checks.push({
			name: "ffmpeg",
			status: "fail",
			message: `FFmpeg was not found at "${path}" (${from}). Install FFmpeg (brew install ffmpeg, apt install ffmpeg), install @motiojs/ffmpeg, or set MOTIO_FFMPEG.`,
			details: { path, ...source },
		});
	} else {
		const { version, release } = parseFfmpegRelease(ffmpeg.output);
		const renderer = await ctx.renderer().catch(() => undefined);
		const [minMajor, minMinor] = renderer?.MIN_FFMPEG_VERSION ?? FALLBACK_MIN_FFMPEG;
		const tooOld =
			release !== null &&
			(release[0] < minMajor || (release[0] === minMajor && release[1] < minMinor));
		const available = parseEncoderList((await run(path, ["-hide_banner", "-encoders"])).output);
		const missing = REQUIRED_ENCODERS.filter((name) => !available.has(name));
		const table = renderer?.VIDEO_CODEC_SPECS
			? Object.fromEntries(
					Object.entries(renderer.VIDEO_CODEC_SPECS).map(([c, spec]) => [c, spec.encoders]),
				)
			: FALLBACK_CODEC_ENCODERS;
		const codecs = codecEncoders(available, table);
		const unavailable = Object.entries(codecs)
			.filter(([, encoder]) => encoder === null)
			.map(([codec]) => `${codec} (${(table[codec] ?? []).join(" or ")})`);
		const using = Object.entries(codecs)
			.filter(([, encoder]) => encoder !== null)
			.map(([codec, encoder]) => `${codec}: ${encoder}`);
		checks.push({
			name: "ffmpeg",
			status: tooOld || missing.length > 0 ? "fail" : unavailable.length > 0 ? "warn" : "pass",
			message: tooOld
				? `FFmpeg ${version} (${from}) is too old; Motio needs ${minMajor}.${minMinor} or later.`
				: missing.length > 0
					? `FFmpeg ${version} (${from}) lacks the ${missing.join(", ")} encoder(s).`
					: unavailable.length > 0
						? `FFmpeg ${version} (${from}); no encoder for ${unavailable.join(", ")}: those codecs fail until FFmpeg has one (or install @motiojs/ffmpeg). Encoders: ${using.join(", ")}.`
						: `FFmpeg ${version} (${from}). Encoders: ${using.join(", ")}.`,
			details: { path, ...source, version, missingEncoders: missing, codecs },
		});
	}
	const ffprobePath = resolved.ffprobe;
	const ffprobe = await run(ffprobePath, ["-hide_banner", "-version"]);
	checks.push({
		name: "ffprobe",
		status: ffprobe.code === 0 ? "pass" : "warn",
		message:
			ffprobe.code === 0
				? `ffprobe ${parseFfmpegRelease(ffprobe.output).version}.`
				: `ffprobe was not found at "${ffprobePath}"; it reads media files (durations, audio tracks) and comes with FFmpeg.`,
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

/**
 * Which config file is in use: a Motio config, a Remotion config (with its settings that have no
 * full effect), or none.
 */
function configCheck(ctx: CommandContext, settings: ProjectConfig): DoctorCheck {
	const details = { file: settings.file, kind: settings.kind, warnings: settings.warnings };
	if (!settings.file) {
		return {
			name: "config",
			status: "pass",
			message: "No config file; defaults apply.",
			details,
		};
	}
	const shown = relative(ctx.io.cwd, settings.file) || settings.file;
	if (settings.kind === "motio") {
		return { name: "config", status: "pass", message: `Using ${shown}.`, details };
	}
	const webpack = settings.warnings.filter(
		(w) => w.setter === "overrideWebpackConfig" || w.setter === "overrideBundlerConfig",
	);
	return {
		name: "config",
		status: settings.warnings.length > 0 ? "warn" : "pass",
		message:
			settings.warnings.length > 0
				? `Using ${shown} (a Remotion config): ${settings.warnings.length} setting(s) without full effect in Motio${webpack.length > 0 ? ", including a webpack override (D-003)" : ""}.`
				: `Using ${shown} (a Remotion config).`,
		details,
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

	// The config comes first: its ffmpeg.executable decides which FFmpeg is checked.
	const projectChecks: DoctorCheck[] = [];
	let settings: ProjectConfig | undefined;
	try {
		settings = await loadProjectConfig(ctx, { rootDir, configFlag: flags.string("config") });
		projectChecks.push(configCheck(ctx, settings));
		try {
			const entry = ctx.bundler.resolveEntryPoint({
				rootDir,
				configEntryPoint: settings.values.entryPoint,
			});
			projectChecks.push({
				name: "entry-point",
				status: "pass",
				message: `Entry point ${entry.path}.`,
				details: { path: entry.path, reason: entry.reason },
			});
		} catch (error) {
			projectChecks.push({
				name: "entry-point",
				status: "warn",
				message: toErrorJson(error).message,
				details: {},
			});
		}
	} catch (error) {
		projectChecks.push({
			name: "config",
			status: "fail",
			message: toErrorJson(error).message,
			details: toErrorJson(error).context,
		});
	}

	const checks: DoctorCheck[] = [nodeCheck(), ...(await checkFfmpeg(ctx, settings))];
	checks.push(
		await checkBrowser(
			ctx,
			flags.string("browser-executable") ?? settings?.values.browserExecutable ?? undefined,
		),
	);
	checks.push(...projectChecks);

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
