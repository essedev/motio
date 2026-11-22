import {
	createBundle,
	loadEnvVariables,
	loadRemotionConfig,
	resolveEntryPoint,
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
import { DOCTOR_FLAGS, doctorCommand } from "./commands/doctor.js";
import { FRAMES_FLAGS, framesCommand } from "./commands/frames.js";
import { RENDER_FLAGS, renderCommand } from "./commands/render.js";
import { STILL_FLAGS, stillCommand } from "./commands/still.js";
import type { CliDeps, CommandContext, CommandResult } from "./context.js";
import { EXIT, exitCodeFor, toErrorJson, usageError } from "./errors.js";
import { type CliIo, Reporter } from "./io.js";
import { loadRenderer } from "./renderer-api.js";

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
		words: ["browser", "ensure"],
		usage: "motio browser ensure",
		summary: "Download the pinned chrome-headless-shell if needed.",
		flags: BROWSER_ENSURE_FLAGS,
		run: browserEnsureCommand,
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

/** Default dependencies: the real renderer, bundler and FFmpeg. */
export function defaultDeps(env: Record<string, string | undefined>): CliDeps {
	let renderer: ReturnType<typeof loadRenderer> | undefined;
	return {
		renderer: () => {
			renderer ??= loadRenderer();
			return renderer;
		},
		bundler: { createBundle, loadRemotionConfig, loadEnvVariables, resolveEntryPoint },
		compatibilityReport: createCompatibilityReport,
		ffmpegPath: env.MOTIO_FFMPEG ?? "ffmpeg",
		onInterrupt: (handler) => {
			process.once("SIGINT", handler);
			return () => process.off("SIGINT", handler);
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
		if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h" || argv[0] === "help") {
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
		const error = usageError(
			`Unknown command "${argv
				.filter((a) => !a.startsWith("-"))
				.slice(0, 2)
				.join(" ")}". Run motio --help.`,
		);
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
		if (json)
			reporter.resultJson({ ok: true, command: name, ...result.json, warnings: reporter.warnings });
		else reporter.result(result.human);
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
