import { existsSync, statSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { type MotioCompatOptions, MotioError, motioCompat, scanSource } from "@motiojs/compat";
import { analyzeWebpackOverrides, type ConfigValues } from "@motiojs/compat/config";
import { build, type InlineConfig, type Logger, type Plugin, type PluginOption } from "vite";
import { compatAliases } from "./compat-aliases.js";
import { type EntryPointReason, resolveEntryPoint } from "./entry-point.js";
import { loadEnvVariables } from "./env.js";
import { copyPublicDir, STATIC_FILES_LIMIT, type StaticFile } from "./public-dir.js";
import { resolveModule, resolveOwnDependency } from "./resolve.js";
import { tailwindSetup } from "./tailwind.js";

/** Global the bundle context module sets before the user entry runs (see `bundle()`). */
export const BUNDLE_GLOBAL = "__motioBundle";

/** Identifier that `process.env` is replaced with in user code. */
export const PROCESS_ENV_GLOBAL = "__MOTIO_ENV__";

/** Directory under the output where `public/` is copied; `staticFile()` URLs start with it. */
export const PUBLIC_SUBDIR = "public";

/** Default page runtime: imported by the generated page after the user entry. */
export const DEFAULT_RUNTIME_MODULE = "@motiojs/core/runtime";

/** Rewrites the Vite configuration, Motio's counterpart of Remotion's `webpackOverride`. */
export type ViteOverrideFn = (config: InlineConfig) => InlineConfig | Promise<InlineConfig>;

/** Options of {@link bundle}, mirroring Remotion's `bundle()` where it applies to Vite. */
export interface BundleOptions {
	/** Path to the file that calls `registerRoot()`, absolute or relative to `rootDir`. */
	entryPoint: string;
	/** Progress from 0 to 100. */
	onProgress?: (progress: number) => void;
	/** Output directory; a new temporary directory by default. Emptied before the build. */
	outDir?: string | null;
	/** Public directory; `public/` in `rootDir` by default, then `Config.setPublicDir()`. */
	publicDir?: string | null;
	/** Directory with the project's `package.json`. Defaults to the current directory. */
	rootDir?: string;
	/** URL path the bundle is hosted at. Default `./` (relocatable), as in Remotion. */
	publicPath?: string;
	/** Accepted for compatibility; Vite keeps no persistent build cache, so it has no effect. */
	enableCaching?: boolean;
	/** Skip the check that the entry file imports `registerRoot`. */
	ignoreRegisterRootWarning?: boolean;
	/** Bytes copied from the public directory so far. */
	onPublicDirCopyProgress?: (bytes: number) => void;
	/** Called for each symlink found in the public directory. */
	onSymlinkDetected?: (path: string) => void;
	/** Not supported: Motio bundles with Vite (D-003). Use `viteOverride`. */
	webpackOverride?: never;
	/** Not supported: Motio bundles with Vite (D-003). Use `viteOverride`. */
	bundlerOverride?: never;
	/** Not supported: Motio bundles with Vite (D-003). Use `viteOverride`. */
	rspackOverride?: never;
	/** Accepted for compatibility (Remotion Studio options); no effect. */
	keyboardShortcutsEnabled?: boolean;
	/** Accepted for compatibility (Remotion Studio options); no effect. */
	askAIEnabled?: boolean;
	/** Not supported: Motio bundles with Vite. `true` throws. */
	rspack?: boolean;

	// Motio additions
	/**
	 * Variables exposed as `process.env`; by default the `.env` file and the shell variables
	 * starting with `MOTIO_` or `REMOTION_`.
	 */
	envVariables?: Record<string, string>;
	/** Dotenv file to read instead of `.env` (`--env-file`). */
	envFile?: string;
	/**
	 * Values from `remotion.config.ts` (see `loadRemotionConfig`). As in Remotion, the Node API
	 * does not read the config file by itself: the CLI loads it and passes the values here.
	 */
	config?: Readonly<Partial<ConfigValues>>;
	/** Rewrites the Vite configuration before the build. */
	viteOverride?: ViteOverrideFn;
	/** Options of the compat plugin. */
	compat?: MotioCompatOptions;
	/** Module exporting `mountPage()`; `@motiojs/core/runtime` by default. */
	runtimeModule?: string;
	/** Minify the output (default `true`). */
	minify?: boolean;
	/** Warnings from the config, the build and the compat plugin. */
	onWarning?: (message: string) => void;
}

/** Everything a build produced; `bundle()` returns only `serveUrl`. */
export interface BundleResult {
	/** Output directory, the `serveUrl` given to the renderer. */
	serveUrl: string;
	entryPoint: string;
	entryPointReason: EntryPointReason;
	/** Public directory copied, or `null` when it does not exist. */
	publicDir: string | null;
	staticFiles: StaticFile[];
	/** Names of the variables exposed as `process.env` (values are not echoed). */
	envVariableNames: string[];
	tailwind: "v3" | "v4" | null;
	warnings: string[];
}

function assertNoWebpackOptions(options: BundleOptions): void {
	for (const key of ["webpackOverride", "bundlerOverride", "rspackOverride"] as const) {
		if (options[key] !== undefined) {
			throw new MotioError(
				"E_WEBPACK_OVERRIDE",
				`bundle({ ${key} }) is not supported: Motio bundles with Vite, so webpack and Rspack overrides have no equivalent (docs/DECISIONS.md D-003). Use the viteOverride option or a Vite plugin instead.`,
				{ option: key },
			);
		}
	}
	if (options.rspack) {
		throw new MotioError(
			"E_WEBPACK_OVERRIDE",
			"bundle({ rspack: true }) is not supported: Motio bundles with Vite (D-003).",
			{ option: "rspack" },
		);
	}
}

function assertSafeOutDir(outDir: string, rootDir: string, entryPoint: string): void {
	const inside = (child: string, parent: string) =>
		child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
	if (inside(rootDir, outDir) || inside(entryPoint, outDir)) {
		throw new MotioError(
			"E_UNSAFE_OUT_DIR",
			`Refusing to use ${outDir} as the output directory: it contains the project, and it is emptied before every build.`,
			{ outDir, rootDir },
		);
	}
}

/** Modules `registerRoot` is imported from. */
const REGISTER_ROOT_SOURCES = new Set(["remotion", "@motiojs/motio", "@motiojs/core"]);
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
/** Most project files read while looking for `registerRoot` from the entry. */
const REGISTER_ROOT_SEARCH_LIMIT = 200;

const isRelative = (specifier: string) => specifier.startsWith("./") || specifier.startsWith("../");

/** Resolves a relative import to a source file, as a bundler would; null for anything else. */
function resolveRelativeSource(from: string, specifier: string): string | null {
	const base = resolve(dirname(from), specifier);
	const extension = extname(base);
	// TypeScript sources may import `./Root.js` for `./Root.tsx`.
	const stem = [".js", ".jsx", ".mjs", ".cjs"].includes(extension)
		? base.slice(0, -extension.length)
		: null;
	const candidates = [
		base,
		...SOURCE_EXTENSIONS.map((ext) => base + ext),
		...(stem ? SOURCE_EXTENSIONS.map((ext) => stem + ext) : []),
		...SOURCE_EXTENSIONS.map((ext) => join(base, `index${ext}`)),
	];
	const found = candidates.find((candidate) => {
		try {
			return statSync(candidate).isFile();
		} catch {
			return false;
		}
	});
	return found && SOURCE_EXTENSIONS.includes(extname(found)) ? found : null;
}

/**
 * Checks, with a parser, that the entry imports `registerRoot`, itself or through the project
 * files it imports statically (`import "./Root"`, where `Root.tsx` calls it).
 */
async function assertRegistersRoot(entryPoint: string): Promise<void> {
	const queue = [entryPoint];
	const seen = new Set(queue);
	while (queue.length > 0) {
		const file = queue.shift() as string;
		const { imports } = scanSource(file, await readFile(file, "utf8"), {
			filter: (s) => REGISTER_ROOT_SOURCES.has(s) || isRelative(s),
		});
		for (const usage of imports) {
			if (REGISTER_ROOT_SOURCES.has(usage.specifier)) {
				if (usage.symbols.some((s) => s.name === "registerRoot" || s.name === "*")) return;
				continue;
			}
			if (usage.kind !== "static" && usage.kind !== "reexport") continue;
			const next = resolveRelativeSource(file, usage.specifier);
			if (next && !seen.has(next) && seen.size < REGISTER_ROOT_SEARCH_LIMIT) {
				seen.add(next);
				queue.push(next);
			}
		}
	}
	throw new MotioError(
		"E_NO_REGISTER_ROOT",
		`The entry point ${entryPoint} does not call registerRoot(), and neither do the project files it imports. Import registerRoot from "@motiojs/motio" and call it with the root component that renders your compositions.`,
		{
			entryPoint,
			hint: "In the Node API, bundle({ ignoreRegisterRootWarning: true }) skips this check.",
		},
	);
}

function normalizePublicPath(publicPath: string): string {
	return publicPath.endsWith("/") ? publicPath : `${publicPath}/`;
}

async function emptyDirectory(directory: string): Promise<void> {
	if (!existsSync(directory)) return;
	for (const entry of await readdir(directory)) {
		await rm(join(directory, entry), { recursive: true, force: true });
	}
}

const ENTRY_ID = "virtual:motio/entry";
const CONTEXT_ID = "virtual:motio/bundle-context";

function escapeHtml(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

interface PagePluginOptions {
	entryPoint: string;
	runtimeModule: string;
	publicPath: string;
	staticBase: string;
	staticFiles: StaticFile[];
	env: Record<string, string>;
}

/** Virtual entry and context modules, and the generated `index.html`. */
function pagePlugin(options: PagePluginOptions): Plugin {
	const resolvedEntry = `\0${ENTRY_ID}`;
	const resolvedContext = `\0${CONTEXT_ID}`;
	return {
		name: "motio:page",
		resolveId(id) {
			if (id === ENTRY_ID) return resolvedEntry;
			if (id === CONTEXT_ID) return resolvedContext;
			return null;
		},
		load(id) {
			if (id === resolvedContext) {
				const bundle = {
					publicPath: options.publicPath,
					staticFiles: options.staticFiles.slice(0, STATIC_FILES_LIMIT),
				};
				// A relative static base resolves against the page URL to a path, as Remotion's
				// bundle does (`new URL("./public", location.href).pathname`): served from the root,
				// staticFile("a.png") is "/public/a.png" (D-046). Without a page (Node) it stays as is.
				return [
					`const rawBase = ${JSON.stringify(options.staticBase)};`,
					`const relative = rawBase.startsWith("./") || rawBase.startsWith("../");`,
					`const staticBase = relative && typeof location !== "undefined" ? new URL(rawBase, location.href).pathname : rawBase;`,
					`const raw = ${JSON.stringify(bundle)};`,
					`const staticFiles = raw.staticFiles.map((file) => ({ ...file, src: staticBase + file.src.slice(rawBase.length) }));`,
					// Runtime variables injected by the renderer (RunContext.env) win over build-time ones.
					`const runContext = globalThis.__motioContext;`,
					`const env = Object.freeze({ ...${JSON.stringify(options.env)}, ...(runContext?.env ?? {}), NODE_ENV: "production" });`,
					`globalThis.${BUNDLE_GLOBAL} = Object.freeze({ ...raw, staticBase, staticFiles, env });`,
					`globalThis.${PROCESS_ENV_GLOBAL} = env;`,
				].join("\n");
			}
			if (id === resolvedEntry) {
				return [
					`import ${JSON.stringify(CONTEXT_ID)};`,
					`import ${JSON.stringify(options.entryPoint)};`,
					`import { mountPage } from ${JSON.stringify(options.runtimeModule)};`,
					`await mountPage();`,
				].join("\n");
			}
			return null;
		},
		generateBundle(_outputOptions, output) {
			const entry = Object.values(output).find(
				(item) => item.type === "chunk" && item.isEntry && item.facadeModuleId === resolvedEntry,
			);
			if (entry?.type !== "chunk") {
				this.error("[motio:page] The page entry chunk was not produced.");
			}
			const css = [...(entry.viteMetadata?.importedCss ?? [])];
			const url = (file: string) => escapeHtml(`${options.publicPath}${file}`);
			const html = [
				"<!doctype html>",
				'<html lang="en">',
				"<head>",
				'<meta charset="utf-8">',
				'<meta name="viewport" content="width=device-width, initial-scale=1">',
				"<title>Motio</title>",
				"<style>html,body{margin:0;padding:0}</style>",
				...css.map((file) => `<link rel="stylesheet" href="${url(file)}">`),
				`<script type="module" src="${url(entry.fileName)}"></script>`,
				"</head>",
				"<body>",
				'<div id="motio-root"></div>',
				"</body>",
				"</html>",
				"",
			].join("\n");
			this.emitFile({ type: "asset", fileName: "index.html", source: html });
		},
	};
}

/** Reports progress from 0 to 100 as modules are transformed. */
function progressPlugin(report: (progress: number) => void): Plugin {
	let transformed = 0;
	return {
		name: "motio:progress",
		buildStart() {
			report(10);
		},
		transform() {
			transformed++;
			report(10 + Math.floor(80 * (transformed / (transformed + 150))));
			return null;
		},
		generateBundle() {
			report(95);
		},
	};
}

function collectingLogger(warnings: string[]): Logger {
	const loggedErrors = new WeakSet<Error>();
	return {
		info: () => {},
		warn: (message) => void warnings.push(message),
		warnOnce: (message) => {
			if (!warnings.includes(message)) warnings.push(message);
		},
		error: () => {},
		clearScreen: () => {},
		hasErrorLogged: (error) => loggedErrors.has(error as Error),
		hasWarned: false,
	};
}

/**
 * Resolves the page runtime the user's own `@motiojs/motio` would load, so core is not duplicated.
 */
function resolveRuntime(rootDir: string, requested: string | undefined): string {
	if (requested) {
		if (isAbsolute(requested)) return requested;
		const path = resolveModule(requested, rootDir) ?? resolveOwnDependency(requested);
		if (!path) {
			throw new MotioError(
				"E_RUNTIME_NOT_FOUND",
				`Cannot resolve the page runtime "${requested}".`,
				{
					runtimeModule: requested,
				},
			);
		}
		return path;
	}
	const motioEntry = resolveModule("@motiojs/motio", rootDir);
	const candidates = [
		motioEntry
			? resolveModule(DEFAULT_RUNTIME_MODULE, motioEntry.replace(/[/\\]dist[/\\].*$/, ""))
			: null,
		resolveModule(DEFAULT_RUNTIME_MODULE, rootDir),
		resolveOwnDependency(DEFAULT_RUNTIME_MODULE),
	];
	const path = candidates.find((candidate): candidate is string => candidate !== null);
	if (!path) {
		throw new MotioError(
			"E_RUNTIME_NOT_FOUND",
			`Cannot resolve "${DEFAULT_RUNTIME_MODULE}" (the page runtime). Install "@motiojs/motio" in the project.`,
			{ rootDir },
		);
	}
	return path;
}

/**
 * Builds a Motio project with Vite into a directory the renderer serves (`serveUrl`), and
 * returns the details of the build. See {@link bundle} for the Remotion-compatible form.
 */
export async function createBundle(options: BundleOptions): Promise<BundleResult> {
	assertNoWebpackOptions(options);
	const warnings: string[] = [];
	let lastProgress = -1;
	const report = (progress: number) => {
		if (progress > lastProgress) {
			lastProgress = progress;
			options.onProgress?.(progress);
		}
	};
	report(0);

	const config = options.config ?? {};
	const rootDir = resolve(options.rootDir ?? process.cwd());
	const entry = resolveEntryPoint({
		rootDir,
		entryPoint: options.entryPoint,
		configEntryPoint: config.entryPoint,
	});
	if (!options.ignoreRegisterRootWarning) await assertRegistersRoot(entry.path);

	const outDir = resolve(options.outDir ?? (await mkdtemp(join(tmpdir(), "motio-bundle-"))));
	assertSafeOutDir(outDir, rootDir, entry.path);
	await emptyDirectory(outDir);

	const publicPath = normalizePublicPath(options.publicPath ?? config.publicPath ?? "./");
	const staticBase = `${publicPath}${PUBLIC_SUBDIR}`;
	const publicDirSetting = options.publicDir ?? config.publicDir ?? "public";
	const publicDir = isAbsolute(publicDirSetting)
		? publicDirSetting
		: join(rootDir, publicDirSetting);
	let staticFiles: StaticFile[] = [];
	if (existsSync(publicDir)) {
		staticFiles = await copyPublicDir(publicDir, join(outDir, PUBLIC_SUBDIR), staticBase, {
			...(options.onPublicDirCopyProgress ? { onProgress: options.onPublicDirCopyProgress } : {}),
			...(options.onSymlinkDetected ? { onSymlinkDetected: options.onSymlinkDetected } : {}),
		});
	} else if (options.publicDir || config.publicDir) {
		throw new MotioError(
			"E_PUBLIC_DIR_NOT_FOUND",
			`The public directory ${publicDir} does not exist.`,
			{
				publicDir,
			},
		);
	}
	report(5);

	const env =
		options.envVariables ??
		loadEnvVariables({ rootDir, envFile: options.envFile ?? config.dotEnvLocation }).variables;

	// Override warnings belong to loading the config (loadRemotionConfig); here only Tailwind matters.
	const tailwindVersion =
		config.tailwind ?? (await analyzeWebpackOverrides(config.webpackOverrides ?? [])).tailwind;
	const tailwind = tailwindVersion ? await tailwindSetup(tailwindVersion, rootDir) : null;

	const plugins: PluginOption[] = [
		motioCompat({
			...options.compat,
			aliases: { ...compatAliases(), ...options.compat?.aliases },
		}),
		pagePlugin({
			entryPoint: entry.path,
			runtimeModule: resolveRuntime(rootDir, options.runtimeModule),
			publicPath,
			staticBase,
			staticFiles,
			env,
		}),
		progressPlugin(report),
		...(tailwind?.plugins ?? []),
	];

	let viteConfig: InlineConfig = {
		root: rootDir,
		base: publicPath,
		mode: "production",
		configFile: false,
		envDir: false,
		publicDir: false,
		logLevel: "warn",
		customLogger: collectingLogger(warnings),
		plugins,
		resolve: { dedupe: ["react", "react-dom"] },
		define: {
			"process.env.NODE_ENV": JSON.stringify("production"),
			"process.env": PROCESS_ENV_GLOBAL,
		},
		// Explicit, so a NODE_ENV inherited from the caller (Vitest sets "test") cannot switch
		// JSX to the development runtime that React's production build does not export.
		oxc: { jsx: { runtime: "automatic", development: false } },
		...(tailwind?.css ? { css: tailwind.css } : {}),
		build: {
			outDir,
			emptyOutDir: false,
			copyPublicDir: false,
			assetsDir: "assets",
			target: "esnext",
			sourcemap: true,
			minify: options.minify ?? true,
			reportCompressedSize: false,
			rolldownOptions: { input: { main: ENTRY_ID } },
		},
	};
	if (options.viteOverride) viteConfig = await options.viteOverride(viteConfig);

	const warningCountBefore = warnings.length;
	try {
		await build(viteConfig);
	} catch (error) {
		throw new MotioError(
			"E_BUNDLE",
			// Rolldown colours its code frames; the message also goes to --json output and logs.
			`Bundling ${relative(rootDir, entry.path) || entry.path} failed: ${stripVTControlCharacters(error instanceof Error ? error.message : String(error))}`,
			{ entryPoint: entry.path },
			{ cause: error },
		);
	}
	for (const message of warnings.slice(warningCountBefore)) options.onWarning?.(message);
	report(100);

	return {
		serveUrl: outDir,
		entryPoint: entry.path,
		entryPointReason: entry.reason,
		publicDir: existsSync(publicDir) ? publicDir : null,
		staticFiles,
		envVariableNames: Object.keys(env).sort(),
		tailwind: tailwindVersion ?? null,
		warnings,
	};
}

/** Remotion's pre-3.2.17 positional form: options without the first-class ones. */
export type LegacyBundleOptions = Omit<
	BundleOptions,
	"entryPoint" | "onProgress" | "ignoreRegisterRootWarning"
>;

/**
 * Bundles a project and returns the output directory, the `serveUrl` the renderer takes.
 * Same contract as Remotion's `bundle()`: call it once and reuse the result for many renders.
 * Accepts the object form and the legacy `bundle(entryPoint, onProgress?, options?)` form.
 */
export async function bundle(options: BundleOptions): Promise<string>;
export async function bundle(
	entryPoint: string,
	onProgress?: (progress: number) => void,
	options?: LegacyBundleOptions,
): Promise<string>;
export async function bundle(
	optionsOrEntryPoint: BundleOptions | string,
	onProgress?: (progress: number) => void,
	legacy?: LegacyBundleOptions,
): Promise<string> {
	const options: BundleOptions =
		typeof optionsOrEntryPoint === "string"
			? { ...legacy, entryPoint: optionsOrEntryPoint, ...(onProgress ? { onProgress } : {}) }
			: optionsOrEntryPoint;
	return (await createBundle(options)).serveUrl;
}
