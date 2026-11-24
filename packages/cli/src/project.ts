import { existsSync, statSync } from "node:fs";
import { rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
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

/**
 * The project root: the nearest folder with a package.json above the entry file (or above the
 * working directory without one), else the working directory. The walk also stops at the working
 * directory when it holds a public/ folder. Running from a parent folder or
 * from src/ then finds the same public/, config and .env as running from the root.
 */
export function findProjectRoot(cwd: string, entryArgument: string | undefined): string {
	let start = cwd;
	if (entryArgument && !/^https?:\/\//.test(entryArgument)) {
		const entry = resolvePath(cwd, entryArgument);
		if (existsSync(entry)) start = statSync(entry).isDirectory() ? entry : dirname(entry);
	}
	let dir = resolve(start);
	for (;;) {
		if (existsSync(join(dir, "package.json"))) return dir;
		// A folder without package.json that has its own public/, run from that folder.
		if (dir === resolve(cwd) && existsSync(join(dir, "public"))) return cwd;
		const parent = dirname(dir);
		if (parent === dir) return cwd;
		dir = parent;
	}
}

/**
 * Where static files come from: `--public-dir` (relative to the working directory), else the
 * config's, else public/ in the project root. `missing` is set when that folder does not exist.
 */
export function publicDirOf(
	ctx: CommandContext,
	rootDir: string,
	flag: string | undefined,
	config: Readonly<Partial<ConfigValues>>,
): { path: string; missing: boolean } {
	const path = flag
		? resolvePath(ctx.io.cwd, flag)
		: config.publicDir
			? resolvePath(rootDir, config.publicDir)
			: join(rootDir, "public");
	return { path, missing: !existsSync(path) };
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
	const rootDir = findProjectRoot(ctx.io.cwd, entryArgument);
	if (rootDir !== ctx.io.cwd) ctx.reporter.verbose(`Project root ${rootDir}`);
	const configFlag = flags.string("config");
	const loaded = await ctx.bundler.loadRemotionConfig({
		rootDir,
		configFile: configFlag ? resolvePath(ctx.io.cwd, configFlag) : undefined,
	});
	if (loaded.file) ctx.reporter.verbose(`Loaded config from ${loaded.file}`);
	for (const warning of loaded.warnings) ctx.reporter.warn(warning.message);
	const config = loaded.values;

	const envFlag = flags.string("env-file");
	const env = ctx.bundler.loadEnvVariables({
		rootDir,
		envFile: envFlag ? resolvePath(ctx.io.cwd, envFlag) : config.dotEnvLocation,
		processEnv: ctx.io.env,
	});
	if (env.file) ctx.reporter.verbose(`Loaded env file from ${env.file}`);

	let serveUrl: string;
	let bundle: BundleResult | null = null;
	const entryPath = entryArgument ? resolvePath(ctx.io.cwd, entryArgument) : undefined;
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
		const publicDirFlag = flags.string("public-dir");
		const publicDir = publicDirOf(ctx, rootDir, publicDirFlag, config);
		if (publicDir.missing && !publicDirFlag) {
			ctx.projectHints.push(
				`No public/ in ${rootDir}: run from the project root or pass --public-dir.`,
			);
		}
		bundle = await ctx.bundler.createBundle({
			entryPoint: entryPath ?? "",
			rootDir,
			config,
			envVariables: env.variables,
			...(publicDirFlag ? { publicDir: publicDir.path } : {}),
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

/** Values of `--capture-method` (D-013). */
const CAPTURE_METHODS = ["auto", "begin-frame", "screenshot"] as const;

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
	const captureMethod = flags.oneOf("capture-method", CAPTURE_METHODS);
	const pagesPerBrowser = flags.integer("pages-per-browser", { min: 1 });

	return {
		serveUrl,
		envVariables: options.envVariables,
		...(props ? { inputProps: parseProps(props, rootDir) } : {}),
		...(timeout ? { timeoutInMilliseconds: timeout } : {}),
		...(port ? { port } : {}),
		...(browserExecutable ? { browserExecutable: resolvePath(rootDir, browserExecutable) } : {}),
		...(logLevel ? { logLevel } : {}),
		...(captureMethod ? { captureMethod } : {}),
		...(pagesPerBrowser ? { pagesPerBrowser } : {}),
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
