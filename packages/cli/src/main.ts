import { readFileSync } from "node:fs";
import {
	createBundle,
	loadEnvVariables,
	loadRemotionConfig,
	resolveEntryPoint,
	startDevServer,
} from "@motiojs/bundler";
import { createCompatibilityReport } from "@motiojs/compat";
import type { FlagSpecs } from "./args.js";
import { BROWSER_ENSURE_FLAGS, browserEnsureCommand } from "./commands/browser-ensure.js";
import {
	checkDeterminismCommand,
	checkFlickerCommand,
	DETERMINISM_FLAGS,
	FLICKER_FLAGS,
} from "./commands/check.js";
import { COMPOSITIONS_FLAGS, compositionsCommand } from "./commands/compositions.js";
import { DEV_FLAGS, devCommand } from "./commands/dev.js";
import { DOCTOR_FLAGS, doctorCommand } from "./commands/doctor.js";
import { FFMPEG_ENSURE_FLAGS, ffmpegEnsureCommand } from "./commands/ffmpeg-ensure.js";
import { FRAMES_FLAGS, framesCommand } from "./commands/frames.js";
import { INIT_FLAGS, initCommand } from "./commands/init.js";
import { RENDER_FLAGS, renderCommand } from "./commands/render.js";
import { STILL_FLAGS, stillCommand } from "./commands/still.js";
import type { CliDeps, CommandContext, CommandResult } from "./context.js";
import { EXIT, exitCodeFor, toErrorJson, usageError } from "./errors.js";
import { type CliIo, Reporter } from "./io.js";
import { loadDistributed, loadRenderer } from "./renderer-api.js";
import { closest } from "./suggest.js";

interface CommandDefinition {
	/** Words that select the command, e.g. `["check", "determinism"]`. */
	words: string[];
	usage: string;
	summary: string;
	flags: FlagSpecs;
	run: (ctx: CommandContext, argv: readonly string[]) => Promise<CommandResult>;
}

/** Every command, in help order. */
export const COMMANDS: readonly CommandDefinition[] = [
	{
		words: ["init"],
		usage: "motio init [dir]",
		summary: "Create a new project from a starter.",
		flags: INIT_FLAGS,
		run: initCommand,
	},
	{
		words: ["render"],
		usage: "motio render [entry-point|serve-url] <composition-id> [output]",
		summary: "Render a video.",
		flags: RENDER_FLAGS,
		run: renderCommand,
	},
	{
		words: ["still"],
		usage: "motio still [entry-point|serve-url] <composition-id> [output]",
		summary: "Render one frame as an image.",
		flags: STILL_FLAGS,
		run: stillCommand,
	},
	{
		words: ["compositions"],
		usage: "motio compositions [entry-point|serve-url]",
		summary: "List the compositions of a project.",
		flags: COMPOSITIONS_FLAGS,
		run: compositionsCommand,
	},
	{
		words: ["frames"],
		usage: "motio frames [entry-point|serve-url] <composition-id> [output]",
		summary: "Render a contact sheet: a grid PNG of evenly spaced frames.",
		flags: FRAMES_FLAGS,
		run: framesCommand,
	},
	{
		words: ["dev"],
		usage: "motio dev [entry-point]",
		summary: "Start the preview page: compositions in a Player, hot reload, render check.",
		flags: DEV_FLAGS,
		run: devCommand,
	},
	{
		words: ["browser", "ensure"],
		usage: "motio browser ensure",
		summary: "Download the pinned chrome-headless-shell if needed.",
		flags: BROWSER_ENSURE_FLAGS,
		run: browserEnsureCommand,
	},
	{
		words: ["ffmpeg", "ensure"],
		usage: "motio ffmpeg ensure",
		summary: "Download the pinned FFmpeg of @motiojs/ffmpeg if needed (when installed).",
		flags: FFMPEG_ENSURE_FLAGS,
		run: ffmpegEnsureCommand,
	},
	{
		words: ["doctor"],
		usage: "motio doctor [project-dir]",
		summary: "Check FFmpeg, the browser, the config and Remotion API compatibility.",
		flags: DOCTOR_FLAGS,
		run: doctorCommand,
	},
	{
		words: ["check", "determinism"],
		usage: "motio check determinism [entry-point|serve-url] <composition-id>",
		summary: "Render in two orders and two concurrencies and compare decoded frames.",
		flags: DETERMINISM_FLAGS,
		run: checkDeterminismCommand,
	},
	{
		words: ["check", "flicker"],
		usage: "motio check flicker [entry-point|serve-url] <composition-id>",
		summary: "Flag frames that differ from both neighbours.",
		flags: FLICKER_FLAGS,
		run: checkFlickerCommand,
	},
];

/** Name used in JSON results, e.g. `check determinism`. */
const commandName = (definition: CommandDefinition) => definition.words.join(" ");

function findCommand(
	argv: readonly string[],
): { definition: CommandDefinition; rest: string[] } | null {
	for (const definition of COMMANDS) {
		if (definition.words.every((word, index) => argv[index] === word)) {
			return { definition, rest: argv.slice(definition.words.length) };
		}
	}
	return null;
}

function generalHelp(): string {
	const width = Math.max(...COMMANDS.map((c) => commandName(c).length)) + 2;
	return [
		"Usage: motio <command> [options]",
		"",
		"Commands:",
		...COMMANDS.map((c) => `  ${commandName(c).padEnd(width)}${c.summary}`),
		"",
		"Every command takes --json (one JSON object on stdout) and --help.",
		"motio --version prints the version.",
		"Exit codes: 0 success, 1 error, 2 invalid arguments, 3 a check found problems.",
		"",
	].join("\n");
}

function commandHelp(definition: CommandDefinition): string {
	const entries = Object.entries(definition.flags);
	const width = Math.max(...entries.map(([name]) => name.length)) + 4;
	return [
		`Usage: ${definition.usage}`,
		"",
		definition.summary,
		"",
		"Options:",
		...entries.map(([name, spec]) => {
			const label = `--${name}${spec.type === "string" ? "=<value>" : ""}`;
			return `  ${label.padEnd(width + 8)}${spec.description}`;
		}),
		"",
	].join("\n");
}

/** The version of `@motiojs/cli`, read from its package.json. */
export function cliVersion(): string {
	const manifest = JSON.parse(
		readFileSync(new URL("../package.json", import.meta.url), "utf8"),
	) as { version?: string };
	return manifest.version ?? "unknown";
}

/** `Unknown command "rendr". Did you mean motio render?`, or the commands of a group. */
export function unknownCommandError(argv: readonly string[]) {
	const words = argv.filter((a) => !a.startsWith("-")).slice(0, 2);
	const typed = words.join(" ");
	if (words.length === 0) {
		return usageError(`Unknown flag ${argv[0]}. Run motio --help for the commands.`, {
			flag: argv[0],
		});
	}
	// A group word alone (`motio check`): list its commands.
	const group = COMMANDS.filter((c) => c.words.length > 1 && c.words[0] === words[0]);
	if (group.length > 0) {
		const names = group.map((c) => `motio ${commandName(c)}`);
		return usageError(
			`"${words[0]}" needs a subcommand: ${names.join(" or ")}. Run motio --help for the commands.`,
			{ command: typed, suggestions: names },
		);
	}
	// Two words may be a mistyped group command (`chek flicker`), else the second is an argument.
	const names = COMMANDS.map(commandName);
	const pair = closest(
		typed,
		names.filter((n) => n.includes(" ")),
	);
	const command = pair ? typed : (words[0] as string);
	const suggestion =
		pair ??
		closest(
			command,
			names.filter((n) => !n.includes(" ")),
		);
	return usageError(
		`Unknown command "${command}".${suggestion ? ` Did you mean motio ${suggestion}?` : ""} Run motio --help for the commands.`,
		{ command, ...(suggestion ? { suggestion } : {}) },
	);
}

/** Default dependencies: the real renderer, bundler and FFmpeg. */
export function defaultDeps(env: Record<string, string | undefined>): CliDeps {
	let renderer: ReturnType<typeof loadRenderer> | undefined;
	const getRenderer = () => {
		renderer ??= loadRenderer();
		return renderer;
	};
	return {
		renderer: getRenderer,
		distributed: loadDistributed,
		bundler: {
			createBundle,
			loadRemotionConfig,
			loadEnvVariables,
			resolveEntryPoint,
			startDevServer,
		},
		compatibilityReport: createCompatibilityReport,
		resolveFfmpeg: async (options) => {
			const loaded = await getRenderer().catch(() => undefined);
			if (loaded?.resolveFfmpeg) return loaded.resolveFfmpeg(options);
			// Without the renderer: the environment, else PATH.
			const ffmpeg = env.MOTIO_FFMPEG ?? "ffmpeg";
			return {
				ffmpeg,
				ffprobe: env.MOTIO_FFPROBE ?? ffmpeg.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1"),
				source: env.MOTIO_FFMPEG ? "env" : "path",
			};
		},
		onInterrupt: (handler) => {
			process.once("SIGINT", handler);
			return () => process.off("SIGINT", handler);
		},
		onTerminate: (handler) => {
			process.once("SIGTERM", handler);
			process.once("SIGHUP", handler);
			return () => {
				process.off("SIGTERM", handler);
				process.off("SIGHUP", handler);
			};
		},
	};
}

/**
 * Runs the CLI and returns the exit code. In JSON mode stdout receives exactly one JSON
 * object: `{ ok: true, command, ..., warnings }` or `{ ok: false, command, error }`.
 */
export async function runCli(argv: readonly string[], io: CliIo, deps: CliDeps): Promise<number> {
	const json = argv.includes("--json");
	const found = findCommand(argv);
	const logArgument = argv.find((a) => a.startsWith("--log="))?.slice("--log=".length);
	const logLevel = (["trace", "verbose", "info", "warn", "error"] as const).find(
		(l) => l === logArgument,
	);
	const reporter = new Reporter(io, json, logLevel ?? "info");

	if (!found) {
		const onlyHelpFlags = argv.every((a) => a === "--json" || a === "--help" || a === "-h");
		if (onlyHelpFlags || argv[0] === "help") {
			if (json)
				reporter.resultJson({
					ok: true,
					command: "help",
					commands: COMMANDS.map(commandName),
					warnings: [],
				});
			else io.stdout(generalHelp());
			return EXIT.ok;
		}
		if (argv[0] === "--version" || argv[0] === "-v" || argv[0] === "version") {
			const version = cliVersion();
			if (json) reporter.resultJson({ ok: true, command: "version", version, warnings: [] });
			else io.stdout(`${version}\n`);
			return EXIT.ok;
		}
		const error = unknownCommandError(argv);
		if (json) reporter.resultJson({ ok: false, command: null, error: toErrorJson(error) });
		else io.stderr(`error: ${error.message}\n`);
		return EXIT.usage;
	}

	const { definition, rest } = found;
	const name = commandName(definition);
	if (rest.includes("--help") || rest.includes("-h")) {
		io.stdout(commandHelp(definition));
		return EXIT.ok;
	}
	const ctx: CommandContext = { ...deps, io, reporter, cleanup: [] };
	try {
		const result = await definition.run(ctx, rest);
		if (json) {
			if (!result.jsonPrinted) {
				reporter.resultJson({
					ok: true,
					command: name,
					...result.json,
					warnings: reporter.warnings,
				});
			}
		} else reporter.result(result.human);
		return result.exitCode ?? EXIT.ok;
	} catch (error) {
		const payload = toErrorJson(error);
		if (json) {
			reporter.resultJson({ ok: false, command: name, error: payload });
		} else {
			reporter.finish();
			io.stderr(`error [${payload.code}]: ${payload.message}\n`);
			if (logLevel === "verbose" || logLevel === "trace") {
				io.stderr(`${JSON.stringify(payload.context, null, 2)}\n`);
			}
		}
		return exitCodeFor(error);
	} finally {
		for (const task of ctx.cleanup.reverse()) {
			await task().catch((error: unknown) =>
				reporter.verbose(
					`Could not clean up: ${error instanceof Error ? error.message : String(error)}`,
				),
			);
		}
	}
}
