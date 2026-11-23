import { existsSync, statSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { BundleResult } from "@motiojs/bundler";
import { MotioError } from "@motiojs/compat";
import { type ConfigValues, GL_RENDERERS, LOG_LEVELS, type LogLevel } from "@motiojs/compat/config";
import type { Flags } from "./args.js";
import type { CommandContext } from "./context.js";
import { usageError } from "./errors.js";
import { parseProps, resolvePath } from "./options.js";
import type { SessionOptions, VideoConfig } from "./renderer-api.js";

/** A project opened for rendering: config loaded, bundle built (or a serve URL given). */
export interface Project {
	config: Readonly<Partial<ConfigValues>>;
	serveUrl: string;
	/** Session options shared by every renderer call. */
	session: SessionOptions;
	bundle: BundleResult | null;
}

const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]sx?)$/;

/** True when a positional argument names an entry point or serve URL rather than an id. */
export function looksLikeEntryPoint(value: string, cwd: string): boolean {
	if (/^https?:\/\//.test(value)) return true;
	if (SOURCE_EXTENSIONS.test(value)) return true;
	return existsSync(resolvePath(cwd, value));
}

/** Reads `--log` (or `Config.setLogLevel`) before anything is printed. */
export function logLevelFrom(flags: Flags): LogLevel | undefined {
	return flags.oneOf("log", LOG_LEVELS);
}

/**
 * Loads `remotion.config.ts`, resolves the serve URL (an http(s) URL, a directory holding a
 * built bundle, or an entry file bundled with Vite) and builds the session options.
 */
export async function openProject(
	ctx: CommandContext,
	flags: Flags,
	entryArgument: string | undefined,
): Promise<Project> {
	const rootDir = ctx.io.cwd;
	const loaded = await ctx.bundler.loadRemotionConfig({
		rootDir,
		configFile: flags.string("config"),
	});
	if (loaded.file) ctx.reporter.verbose(`Loaded config from ${loaded.file}`);
	for (const warning of loaded.warnings) ctx.reporter.warn(warning.message);
	const config = loaded.values;

	const env = ctx.bundler.loadEnvVariables({
		rootDir,
		envFile: flags.string("env-file") ?? config.dotEnvLocation,
		processEnv: ctx.io.env,
	});
	if (env.file) ctx.reporter.verbose(`Loaded env file from ${env.file}`);

	let serveUrl: string;
	let bundle: BundleResult | null = null;
	const entryPath = entryArgument ? resolvePath(rootDir, entryArgument) : undefined;
	if (entryArgument && /^https?:\/\//.test(entryArgument)) {
		serveUrl = entryArgument;
	} else if (entryPath && existsSync(entryPath) && statSync(entryPath).isDirectory()) {
		if (!existsSync(join(entryPath, "index.html"))) {
			throw usageError(
				`${entryPath} is a directory without index.html: pass an entry file or a bundle directory.`,
				{
					path: entryPath,
				},
			);
		}
		serveUrl = entryPath;
	} else {
		const publicDir = flags.string("public-dir");
		bundle = await ctx.bundler.createBundle({
			entryPoint: entryArgument ?? "",
			rootDir,
			config,
			envVariables: env.variables,
			...(publicDir ? { publicDir: resolvePath(rootDir, publicDir) } : {}),
			onProgress: (progress) => ctx.reporter.progress("Bundling", progress / 100),
			onWarning: (message) => ctx.reporter.warn(message),
		});
		const outDir = bundle.serveUrl;
		ctx.cleanup.push(() => rm(outDir, { recursive: true, force: true }));
		ctx.reporter.info(
			`Entry point ${bundle.entryPoint} (${bundle.entryPointReason === "common paths" ? "found in a common path" : `from the ${bundle.entryPointReason}`})`,
		);
		serveUrl = outDir;
	}

	const session = buildSessionOptions(ctx, flags, {
		config,
		envVariables: env.variables,
		serveUrl,
		rendererPort: flags.integer("port", { min: 1, max: 65535 }) ?? config.rendererPort ?? undefined,
	});
	return { config, serveUrl, session, bundle };
}

/**
 * The renderer options every call shares (browser, timeout, logging, props), read from the
 * flags with the config as fallback. `rendererPort` is passed in because `motio dev` uses
 * `--port` for its own server.
 */
export function buildSessionOptions(
	ctx: CommandContext,
	flags: Flags,
	options: {
		config: Readonly<Partial<ConfigValues>>;
		envVariables: Record<string, string>;
		serveUrl: string;
		rendererPort: number | undefined;
	},
): SessionOptions {
	const { config, serveUrl } = options;
	const rootDir = ctx.io.cwd;
	const gl = flags.oneOf("gl", GL_RENDERERS) ?? config.chromiumOpenGlRenderer ?? undefined;
	const userAgent = flags.string("user-agent") ?? config.chromiumUserAgent ?? undefined;
	const timeout =
		flags.integer("timeout", { min: 1 }) ?? config.delayRenderTimeoutInMilliseconds ?? undefined;
	const port = options.rendererPort;
	const browserExecutable =
		flags.string("browser-executable") ?? config.browserExecutable ?? undefined;
	const props = flags.string("props");
	const logLevel = logLevelFrom(flags) ?? config.logLevel;

	return {
		serveUrl,
		envVariables: options.envVariables,
		...(props ? { inputProps: parseProps(props, rootDir) } : {}),
		...(timeout ? { timeoutInMilliseconds: timeout } : {}),
		...(port ? { port } : {}),
		...(browserExecutable ? { browserExecutable: resolvePath(rootDir, browserExecutable) } : {}),
		...(logLevel ? { logLevel } : {}),
		chromiumOptions: {
			...(gl ? { gl } : {}),
			...(userAgent ? { userAgent } : {}),
			ignoreCertificateErrors:
				flags.boolean("ignore-certificate-errors") ??
				config.chromiumIgnoreCertificateErrors ??
				false,
			disableWebSecurity:
				flags.boolean("disable-web-security") ?? config.chromiumDisableWebSecurity ?? false,
			darkMode: flags.boolean("dark-mode") ?? config.chromiumDarkMode ?? false,
			...(config.chromiumHeadlessMode !== undefined
				? { headless: config.chromiumHeadlessMode }
				: {}),
		},
		onBrowserLog: (log) => ctx.reporter.verbose(`[browser ${log.type}] ${log.text}`),
	};
}

/** Lists composition ids, for the error raised when none was given. */
async function compositionIds(ctx: CommandContext, project: Project): Promise<string[]> {
	const renderer = await ctx.renderer();
	return (await renderer.getCompositions(project.session)).map((c) => c.id);
}

/**
 * Selects the composition (running `calculateMetadata` with the input props) and applies the
 * width, height, fps and duration overrides. Without an id, fails with the available ids, as
 * Remotion does in a non-interactive terminal.
 */
export async function selectComposition(
	ctx: CommandContext,
	project: Project,
	flags: Flags,
	id: string | undefined,
): Promise<VideoConfig> {
	if (!id) {
		const ids = await compositionIds(ctx, project);
		throw new MotioError(
			"E_COMPOSITION_REQUIRED",
			ids.length > 0
				? `Pass a composition id. Available: ${ids.join(", ")}.`
				: "Pass a composition id. The project registers no compositions.",
			{ compositions: ids },
		);
	}
	const renderer = await ctx.renderer();
	const composition = await renderer.selectComposition({ ...project.session, id });
	const width = flags.integer("width", { min: 1 }) ?? project.config.width;
	const height = flags.integer("height", { min: 1 }) ?? project.config.height;
	const fps = flags.number("fps", (n) => n > 0, "a positive number") ?? project.config.fps;
	const duration = flags.integer("duration", { min: 1 }) ?? project.config.durationInFrames;
	return {
		...composition,
		...(width ? { width } : {}),
		...(height ? { height } : {}),
		...(fps ? { fps } : {}),
		...(duration ? { durationInFrames: duration } : {}),
	};
}

/** Splits `[entry] <id> [output]` positionals the way Remotion's CLI does. */
export function splitPositionals(
	positionals: readonly string[],
	cwd: string,
): { entry: string | undefined; id: string | undefined; output: string | undefined } {
	const [first, second, third, ...rest] = positionals;
	if (rest.length > 0) {
		throw usageError(`Too many arguments: ${positionals.join(" ")}.`, { positionals });
	}
	if (first !== undefined && (third !== undefined || looksLikeEntryPoint(first, cwd))) {
		return { entry: first, id: second, output: third };
	}
	if (third !== undefined) {
		throw usageError(`Too many arguments: ${positionals.join(" ")}.`, { positionals });
	}
	return { entry: undefined, id: first, output: second };
}

/** Composition summary used in every JSON result. */
export function compositionJson(composition: VideoConfig): Record<string, unknown> {
	return {
		id: composition.id,
		width: composition.width,
		height: composition.height,
		fps: composition.fps,
		durationInFrames: composition.durationInFrames,
	};
}
