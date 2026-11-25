import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_DEV_PORT, type DevLogLevel } from "@motiojs/bundler";
import { Flags, parseCommandArgs } from "../args.js";
import { loadProjectConfig, viteOverrideOf } from "../config.js";
import type { CommandContext, CommandResult } from "../context.js";
import { usageError } from "../errors.js";
import { BASE_FLAGS, PROJECT_FLAGS } from "../flags.js";
import { parseProps, resolvePath } from "../options.js";
import { buildSessionOptions, findProjectRoot } from "../project.js";
import { DevStillRenderer } from "./dev-still.js";

export const DEV_FLAGS = {
	...BASE_FLAGS,
	props: {
		type: "string",
		description: "Input props (JSON or a JSON file), merged over each composition's default props.",
	},
	config: PROJECT_FLAGS.config,
	"env-file": PROJECT_FLAGS["env-file"],
	"public-dir": PROJECT_FLAGS["public-dir"],
	port: {
		type: "string",
		description:
			"Port of the preview page; fails if taken. Default dev.port of the config, else 3000, then the next free port.",
	},
	host: { type: "string", description: "Host to bind (default localhost)." },
	open: { type: "boolean", description: "Open the page in the default browser." },
	"disable-keyboard-shortcuts": {
		type: "boolean",
		description: "Turn off the page's keyboard shortcuts.",
	},
	"browser-executable": PROJECT_FLAGS["browser-executable"],
	timeout: PROJECT_FLAGS.timeout,
	gl: PROJECT_FLAGS.gl,
	"ignore-certificate-errors": PROJECT_FLAGS["ignore-certificate-errors"],
	"disable-web-security": PROJECT_FLAGS["disable-web-security"],
	"user-agent": PROJECT_FLAGS["user-agent"],
	"dark-mode": PROJECT_FLAGS["dark-mode"],
} as const;

/** `Config.setStudioPort()` warns that it has no effect, but `motio dev` reads it. */
const DEV_HONOURED_SETTERS = new Set(["setStudioPort"]);

/** Waits for Ctrl+C or a termination signal. */
function waitForShutdown(ctx: CommandContext): Promise<string> {
	return new Promise((resolve) => {
		const stops: Array<() => void> = [];
		const done = (signal: string) => () => {
			for (const stop of stops) stop();
			resolve(signal);
		};
		stops.push(ctx.onInterrupt(done("interrupt")));
		if (ctx.onTerminate) stops.push(ctx.onTerminate(done("terminate")));
	});
}

/**
 * `motio dev [entry-point]`: starts the Vite dev server with the preview page and runs until
 * interrupted. In JSON mode it prints one object as soon as the server listens (the URL among
 * other fields) and nothing after it.
 */
export async function devCommand(
	ctx: CommandContext,
	argv: readonly string[],
): Promise<CommandResult> {
	const { positionals, values } = parseCommandArgs(argv, DEV_FLAGS);
	const flags = new Flags(values);
	if (positionals.length > 1) {
		throw usageError(`Too many arguments: ${positionals.join(" ")}. Pass one entry point.`, {
			positionals,
		});
	}
	const entryArgument = positionals[0];
	if (entryArgument && /^https?:\/\//.test(entryArgument)) {
		throw usageError("motio dev needs an entry file, not a serve URL.", { entry: entryArgument });
	}
	const port = flags.integer("port", { min: 1, max: 65535 });
	const host = flags.string("host");
	const propsFlag = flags.string("props");
	const initialProps = propsFlag ? parseProps(propsFlag, ctx.io.cwd) : {};
	const rootDir = findProjectRoot(ctx.io.cwd, entryArgument);
	if (rootDir !== ctx.io.cwd) ctx.reporter.verbose(`Project root ${rootDir}`);
	const entryPoint = entryArgument ? resolvePath(ctx.io.cwd, entryArgument) : "";
	const configFlag = flags.string("config");

	const settings = await loadProjectConfig(ctx, { rootDir, configFlag, purpose: "still" });
	for (const warning of settings.warnings) {
		if (!DEV_HONOURED_SETTERS.has(warning.setter)) ctx.reporter.warn(warning.message);
	}
	const config = settings.values;
	const devSettings = settings.motio.dev ?? {};
	const viteOverride = viteOverrideOf(settings);
	const envFlag = flags.string("env-file");
	const env = ctx.bundler.loadEnvVariables({
		rootDir,
		envFile: envFlag ? resolvePath(ctx.io.cwd, envFlag) : config.dotEnvLocation,
		processEnv: ctx.io.env,
	});
	if (env.file) ctx.reporter.verbose(`Loaded env file from ${env.file}`);
	const publicDirFlag = flags.string("public-dir");
	const publicDir = publicDirFlag ? resolvePath(ctx.io.cwd, publicDirFlag) : undefined;

	const workDir = await mkdtemp(join(tmpdir(), "motio-dev-"));
	ctx.cleanup.push(() => rm(workDir, { recursive: true, force: true }));
	// The page sends its props with each request, and each bundle has its own serve URL.
	const {
		serveUrl: _serveUrl,
		inputProps: _inputProps,
		...session
	} = buildSessionOptions(ctx, flags, {
		config,
		envVariables: env.variables,
		serveUrl: "",
		rendererPort: config.rendererPort ?? undefined,
		timeModel: settings.motio.render?.timeModel,
		browser: settings.motio.browser,
	});
	const stills = new DevStillRenderer({
		ctx,
		workDir,
		session,
		bundleOptions: {
			entryPoint,
			rootDir,
			config,
			envVariables: env.variables,
			...(publicDir ? { publicDir } : {}),
			...(viteOverride ? { viteOverride } : {}),
			onWarning: (message) => ctx.reporter.verbose(`Render check: ${message}`),
		},
	});

	const log = (level: DevLogLevel, message: string) => {
		if (level === "info") ctx.reporter.verbose(message);
		else if (level === "warn") ctx.reporter.warn(message);
		else if (ctx.reporter.json) ctx.reporter.verbose(`error: ${message}`);
		else ctx.io.stderr(`error: ${message}\n`);
	};
	const server = await ctx.bundler.startDevServer({
		entryPoint,
		rootDir,
		config,
		envVariables: env.variables,
		...(publicDir ? { publicDir } : {}),
		...(viteOverride ? { viteOverride } : {}),
		// The config's port (`dev.port`, read by the server as studioPort) moves on when taken,
		// like the default; only --port fails.
		...(port !== undefined ? { port, strictPort: true } : {}),
		...((host ?? devSettings.host) ? { host: host ?? devSettings.host } : {}),
		open: flags.boolean("open") ?? devSettings.open ?? false,
		initialProps,
		keyboardShortcuts: flags.boolean("disable-keyboard-shortcuts")
			? false
			: (devSettings.keyboardShortcuts ?? true),
		onRenderStill: (request, signal) => stills.render(request, signal),
		onFileChange: () => stills.invalidate(),
		onLog: log,
	});
	ctx.cleanup.push(() => server.close());

	const details = {
		url: server.url,
		port: server.port,
		entryPoint: server.entryPoint,
		entryPointReason: server.entryPointReason,
		publicDir: server.publicDir,
		envVariableNames: server.envVariableNames,
		pid: process.pid,
	};
	if (ctx.reporter.json) {
		ctx.reporter.resultJson({
			ok: true,
			command: "dev",
			...details,
			warnings: ctx.reporter.warnings,
		});
	} else {
		const wanted = port ?? config.studioPort ?? DEFAULT_DEV_PORT;
		if (server.port !== wanted) {
			ctx.reporter.info(`Port ${wanted} is in use; using ${server.port}.`);
		}
		ctx.io.stdout(`Motio preview: ${server.url}\n`);
		ctx.reporter.verbose(
			`Entry point ${server.entryPoint} (${server.entryPointReason === "common paths" ? "found in a common path" : `from the ${server.entryPointReason}`})`,
		);
		ctx.reporter.info("Press Ctrl+C to stop.");
	}

	const signal = await waitForShutdown(ctx);
	ctx.reporter.verbose(`Stopping the dev server (${signal})`);
	return { json: details, human: ["Stopped."], jsonPrinted: true };
}
