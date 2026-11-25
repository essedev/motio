import { existsSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { closest, MotioError } from "@motiojs/compat";
import {
	CODECS,
	COLOR_SPACES,
	GL_RENDERERS,
	LOG_LEVELS,
	PIXEL_FORMATS,
	PRORES_PROFILES,
	STILL_IMAGE_FORMATS,
	VIDEO_IMAGE_FORMATS,
	X264_PRESETS,
} from "@motiojs/compat/config";
import type { MotioConfig } from "@motiojs/core/config";
import { runnerImport } from "vite";
import type { ViteOverrideFn } from "./bundle.js";
import { CONFIG_FILE_NAMES } from "./config-file.js";

/** Motio config file names looked up in the project root, in order. */
export const MOTIO_CONFIG_FILE_NAMES: readonly string[] = [
	"motio.config.ts",
	"motio.config.mts",
	"motio.config.js",
	"motio.config.mjs",
];

/** One rule of the config schema. */
type Rule =
	| { kind: "string" }
	| { kind: "boolean" }
	| { kind: "integer"; min?: number; max?: number }
	| { kind: "scale" }
	| { kind: "concurrency" }
	| { kind: "enum"; values: readonly string[] }
	| { kind: "function" }
	| { kind: "timeZone" }
	| { kind: "group"; keys: Readonly<Record<string, Rule>> };

const string: Rule = { kind: "string" };
const boolean: Rule = { kind: "boolean" };
const integer = (min?: number, max?: number): Rule => ({
	kind: "integer",
	...(min !== undefined ? { min } : {}),
	...(max !== undefined ? { max } : {}),
});
const oneOf = (values: readonly string[]): Rule => ({ kind: "enum", values });
const group = (keys: Record<string, Rule>): Rule => ({ kind: "group", keys });
const timeZone: Rule = { kind: "timeZone" };

/** Whether `value` names a time zone this Node.js knows (the IANA names Chrome knows too). */
function isTimeZone(value: unknown): boolean {
	if (typeof value !== "string" || value === "") return false;
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: value });
		return true;
	} catch {
		return false;
	}
}

/**
 * Every key of `MotioConfig` with its rule. `SchemaOf` makes the compiler fail when a key of the
 * type has no rule, or a rule names a key the type lacks.
 */
type SchemaOf<T> = { readonly [K in keyof Required<T>]-?: Rule };

const RENDER_SCHEMA = {
	codec: oneOf(CODECS),
	crf: integer(0),
	concurrency: { kind: "concurrency" },
	imageFormat: oneOf(VIDEO_IMAGE_FORMATS),
	jpegQuality: integer(0, 100),
	scale: { kind: "scale" },
	muted: boolean,
	pixelFormat: oneOf(PIXEL_FORMATS),
	colorSpace: oneOf(COLOR_SPACES),
	x264Preset: oneOf(X264_PRESETS),
	proResProfile: oneOf(PRORES_PROFILES),
	numberOfGifLoops: integer(0),
	everyNthFrame: integer(1),
	audioCodec: oneOf(["aac", "mp3", "opus", "pcm-16"]),
	audioBitrate: string,
	sampleRate: integer(1),
	enforceAudioTrack: boolean,
	preferLossless: boolean,
	overwrite: boolean,
	imageSequencePattern: string,
	timeModel: oneOf(["frame", "virtual"]),
} as const satisfies SchemaOf<NonNullable<MotioConfig["render"]>>;

const STILL_SCHEMA = {
	imageFormat: oneOf(STILL_IMAGE_FORMATS),
	jpegQuality: integer(0, 100),
	scale: { kind: "scale" },
	overwrite: boolean,
} as const satisfies SchemaOf<NonNullable<MotioConfig["still"]>>;

const CHROMIUM_SCHEMA = {
	gl: oneOf(GL_RENDERERS),
	userAgent: string,
	ignoreCertificateErrors: boolean,
	disableWebSecurity: boolean,
	darkMode: boolean,
	headless: boolean,
} as const satisfies SchemaOf<NonNullable<NonNullable<MotioConfig["browser"]>["chromiumOptions"]>>;

const BROWSER_SCHEMA = {
	executable: string,
	timeoutMs: integer(1),
	captureMethod: oneOf(["auto", "begin-frame", "screenshot"]),
	pagesPerBrowser: integer(1),
	raster: oneOf(["cpu", "gpu"]),
	canvas: oneOf(["software", "gpu"]),
	timeZone,
	chromiumOptions: group(CHROMIUM_SCHEMA),
} as const satisfies SchemaOf<NonNullable<MotioConfig["browser"]>>;

const FFMPEG_SCHEMA = {
	executable: string,
	ffprobeExecutable: string,
} as const satisfies SchemaOf<NonNullable<MotioConfig["ffmpeg"]>>;

const DEV_SCHEMA = {
	port: integer(1, 65535),
	host: string,
	open: boolean,
	keyboardShortcuts: boolean,
} as const satisfies SchemaOf<NonNullable<MotioConfig["dev"]>>;

/** The schema of `motio.config.ts`. */
const CONFIG_SCHEMA = {
	entryPoint: string,
	publicDir: string,
	outDir: string,
	envFile: string,
	logLevel: oneOf(LOG_LEVELS),
	tailwind: oneOf(["v3", "v4"]),
	render: group(RENDER_SCHEMA),
	still: group(STILL_SCHEMA),
	browser: group(BROWSER_SCHEMA),
	ffmpeg: group(FFMPEG_SCHEMA),
	dev: group(DEV_SCHEMA),
	vite: { kind: "function" },
} as const satisfies SchemaOf<MotioConfig>;

/** Every key path of the schema (`render.codec`, ...), for suggestions across groups. */
function keyPaths(keys: Readonly<Record<string, Rule>>, prefix = ""): string[] {
	return Object.entries(keys).flatMap(([key, rule]) => [
		`${prefix}${key}`,
		...(rule.kind === "group" ? keyPaths(rule.keys, `${prefix}${key}.`) : []),
	]);
}

const ALL_KEY_PATHS = keyPaths(CONFIG_SCHEMA);

function describe(value: unknown): string {
	if (typeof value === "function") return "a function";
	if (Array.isArray(value)) return "an array";
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

/** What a value of the rule looks like, for messages. */
function expected(rule: Rule): string {
	switch (rule.kind) {
		case "string":
			return "a string";
		case "boolean":
			return "true or false";
		case "integer":
			return rule.min !== undefined && rule.max !== undefined
				? `an integer from ${rule.min} to ${rule.max}`
				: rule.min !== undefined
					? `an integer of at least ${rule.min}`
					: "an integer";
		case "scale":
			return "a number above 0 and at most 16";
		case "concurrency":
			return 'a positive integer or a percentage such as "50%"';
		case "enum":
			return `one of ${rule.values.join(", ")}`;
		case "function":
			return "a function";
		case "timeZone":
			return 'an IANA time zone name such as "UTC" or "Europe/Rome"';
		case "group":
			return "an object";
	}
}

function matches(rule: Rule, value: unknown): boolean {
	switch (rule.kind) {
		case "string":
			return typeof value === "string";
		case "boolean":
			return typeof value === "boolean";
		case "integer":
			return (
				Number.isInteger(value) &&
				(rule.min === undefined || (value as number) >= rule.min) &&
				(rule.max === undefined || (value as number) <= rule.max)
			);
		case "scale":
			return typeof value === "number" && value > 0 && value <= 16;
		case "concurrency":
			return (
				(Number.isInteger(value) && (value as number) >= 1) ||
				(typeof value === "string" && /^\d+(\.\d+)?%$/.test(value) && Number.parseFloat(value) > 0)
			);
		case "enum":
			return typeof value === "string" && rule.values.includes(value);
		case "function":
			return typeof value === "function";
		case "timeZone":
			return isTimeZone(value);
		case "group":
			return isPlainObject(value);
	}
}

/** One problem found by {@link validateConfig}. */
export interface ConfigProblem {
	/** Key path, such as `render.codec`. */
	key: string;
	message: string;
	/** The nearest valid key or value, when the problem is a likely typo. */
	suggestion?: string;
}

function check(
	keys: Readonly<Record<string, Rule>>,
	value: Record<string, unknown>,
	prefix: string,
	problems: ConfigProblem[],
): void {
	for (const [key, item] of Object.entries(value)) {
		const path = `${prefix}${key}`;
		const rule = keys[key];
		if (!rule) {
			// A key of another group (`codec` at the top level) is suggested with its group.
			const suggestion =
				closest(key, Object.keys(keys)) ??
				ALL_KEY_PATHS.find((candidate) => candidate.endsWith(`.${key}`)) ??
				closest(path, ALL_KEY_PATHS);
			const suggested = suggestion?.includes(".")
				? suggestion
				: suggestion
					? `${prefix}${suggestion}`
					: null;
			problems.push({
				key: path,
				message: `unknown key "${path}".${suggested ? ` Did you mean "${suggested}"?` : ""}`,
				...(suggested ? { suggestion: suggested } : {}),
			});
			continue;
		}
		// `undefined` means unset, as when a value comes from a variable that may be missing.
		if (item === undefined) continue;
		if (!matches(rule, item)) {
			const near =
				rule.kind === "enum" && typeof item === "string" ? closest(item, rule.values) : null;
			problems.push({
				key: path,
				message: `${path} must be ${expected(rule)}; got ${describe(item)}.${near ? ` Did you mean "${near}"?` : ""}`,
				...(near ? { suggestion: near } : {}),
			});
			continue;
		}
		if (rule.kind === "group")
			check(rule.keys, item as Record<string, unknown>, `${path}.`, problems);
	}
}

/**
 * Checks a config object against the schema and returns it typed. Every problem is reported at
 * once in one `E_INVALID_CONFIG` error (`context.problems`), with the nearest valid key for an
 * unknown one and the nearest value for a mistyped choice. `source` names the file in messages.
 */
export function validateConfig(value: unknown, source = "motio.config.ts"): MotioConfig {
	if (!isPlainObject(value)) {
		throw new MotioError(
			"E_INVALID_CONFIG",
			`${source} must export an object as default: export default defineConfig({ ... }); got ${describe(value)}.`,
			{ file: source, problems: [] },
		);
	}
	const problems: ConfigProblem[] = [];
	check(CONFIG_SCHEMA, value, "", problems);
	if (problems.length > 0) {
		const lines = problems.map((p) => `  ${p.message}`).join("\n");
		throw new MotioError(
			"E_INVALID_CONFIG",
			problems.length === 1
				? `${source}: ${problems[0]?.message}`
				: `${source} has ${problems.length} problems:\n${lines}`,
			{ file: source, problems },
		);
	}
	return value as MotioConfig;
}

/** An environment variable that sets a config key, named after the CLI flag it mirrors. */
export interface ConfigEnvVariable {
	name: string;
	/** Key path it sets, such as `render.concurrency`. */
	key: string;
}

/**
 * Environment variables that override the config file and are overridden by flags. They are
 * settings of the machine (cores, Chrome, FFmpeg, slow CI), not of the video: project settings
 * such as the codec belong in the file. Each is named after its flag (`--concurrency` is
 * `MOTIO_CONCURRENCY`); `MOTIO_FFMPEG` and `MOTIO_FFPROBE` have no flag.
 */
export const CONFIG_ENV_VARIABLES: readonly ConfigEnvVariable[] = [
	{ name: "MOTIO_CONCURRENCY", key: "render.concurrency" },
	{ name: "MOTIO_TIMEOUT", key: "browser.timeoutMs" },
	{ name: "MOTIO_LOG", key: "logLevel" },
	{ name: "MOTIO_BROWSER_EXECUTABLE", key: "browser.executable" },
	{ name: "MOTIO_GL", key: "browser.chromiumOptions.gl" },
	{ name: "MOTIO_CAPTURE_METHOD", key: "browser.captureMethod" },
	{ name: "MOTIO_PAGES_PER_BROWSER", key: "browser.pagesPerBrowser" },
	{ name: "MOTIO_FFMPEG", key: "ffmpeg.executable" },
	{ name: "MOTIO_FFPROBE", key: "ffmpeg.ffprobeExecutable" },
];

function ruleAt(path: string): Rule {
	let keys: Readonly<Record<string, Rule>> = CONFIG_SCHEMA;
	let rule: Rule | undefined;
	for (const part of path.split(".")) {
		rule = keys[part];
		if (!rule) throw new Error(`No config key ${path}.`);
		if (rule.kind === "group") keys = rule.keys;
	}
	return rule as Rule;
}

function setAt(target: Record<string, unknown>, path: string, value: unknown): void {
	const parts = path.split(".");
	let node = target;
	for (const part of parts.slice(0, -1)) {
		node[part] ??= {};
		node = node[part] as Record<string, unknown>;
	}
	node[parts[parts.length - 1] as string] = value;
}

/**
 * The config keys set by `MOTIO_*` variables of `env` (see {@link CONFIG_ENV_VARIABLES}).
 * Numbers are parsed; an invalid value is an `E_INVALID_CONFIG` error naming the variable.
 * Empty variables are ignored.
 */
export function configFromEnv(env: Record<string, string | undefined>): MotioConfig {
	const config: Record<string, unknown> = {};
	const problems: ConfigProblem[] = [];
	for (const variable of CONFIG_ENV_VARIABLES) {
		const raw = env[variable.name]?.trim();
		if (!raw) continue;
		const rule = ruleAt(variable.key);
		const value =
			rule.kind === "integer" || (rule.kind === "concurrency" && /^\d+$/.test(raw))
				? Number(raw)
				: raw;
		if (!matches(rule, value) || (rule.kind === "integer" && !/^\d+$/.test(raw))) {
			const near = rule.kind === "enum" ? closest(raw, rule.values) : null;
			problems.push({
				key: variable.key,
				message: `${variable.name} must be ${expected(rule)}; got ${JSON.stringify(raw)}.${near ? ` Did you mean "${near}"?` : ""}`,
			});
			continue;
		}
		setAt(config, variable.key, value);
	}
	if (problems.length > 0) {
		throw new MotioError("E_INVALID_CONFIG", problems.map((p) => p.message).join("\n"), {
			problems,
		});
	}
	return config as MotioConfig;
}

/**
 * `override` over `base`, group by group: a key set in `override` wins, an absent or undefined
 * one keeps the base value.
 */
export function mergeConfig(base: MotioConfig, override: MotioConfig): MotioConfig {
	const merge = (a: Record<string, unknown>, b: Record<string, unknown>) => {
		const out: Record<string, unknown> = { ...a };
		for (const [key, value] of Object.entries(b)) {
			if (value === undefined) continue;
			out[key] =
				isPlainObject(value) && isPlainObject(out[key])
					? merge(out[key] as Record<string, unknown>, value)
					: value;
		}
		return out;
	};
	return merge(base as Record<string, unknown>, override as Record<string, unknown>) as MotioConfig;
}

export interface LoadMotioConfigOptions {
	/** Project root, where the config file is looked up. Default: the working directory. */
	rootDir?: string;
	/** A path to the config file, absolute or relative to `rootDir`; must exist when given. */
	configFile?: string | undefined;
	/**
	 * Environment whose `MOTIO_*` variables override the file (see `CONFIG_ENV_VARIABLES`).
	 * Default `process.env`; `false` reads the file alone.
	 */
	env?: Record<string, string | undefined> | false;
}

export interface LoadedMotioConfig {
	/** Absolute path of the file loaded, or `null` when the project has none. */
	file: string | null;
	/** The validated settings, with the environment variables applied. */
	config: MotioConfig;
	/**
	 * A `remotion.config.*` in the root that was not read because the Motio config wins, or
	 * `null`. The CLI warns about it.
	 */
	ignoredFile: string | null;
	/**
	 * The config as options of `bundle()`: entry point, public directory and env file resolved
	 * against the root, the `vite` function and Tailwind. Spread it: `bundle({ ...bundleOptions })`.
	 */
	bundleOptions: ConfigBundleOptions;
	/**
	 * The `browser`, `ffmpeg` and `logLevel` settings under the names of the renderer's options
	 * (`browserExecutable`, `timeoutInMilliseconds`, ...), to spread into `renderMedia()`,
	 * `renderStill()`, `selectComposition()` and the others, next to `config.render` or
	 * `config.still`.
	 */
	sessionOptions: ConfigSessionOptions;
}

/** {@link LoadedMotioConfig.bundleOptions}. */
export interface ConfigBundleOptions {
	/** Absolute, or `""` to look the entry point up in the common paths. */
	entryPoint: string;
	rootDir: string;
	publicDir?: string;
	envFile?: string;
	viteOverride?: ViteOverrideFn;
	config?: { tailwind: "v3" | "v4" };
}

/** {@link LoadedMotioConfig.sessionOptions}. */
export interface ConfigSessionOptions {
	browserExecutable?: string;
	timeoutInMilliseconds?: number;
	captureMethod?: "auto" | "begin-frame" | "screenshot";
	pagesPerBrowser?: number;
	raster?: "cpu" | "gpu";
	canvas?: "software" | "gpu";
	timeZone?: string;
	chromiumOptions?: NonNullable<NonNullable<MotioConfig["browser"]>["chromiumOptions"]>;
	logLevel?: NonNullable<MotioConfig["logLevel"]>;
	ffmpegExecutable?: string;
	ffprobeExecutable?: string;
}

/** Drops undefined entries, for `exactOptionalPropertyTypes`. */
function defined<T extends Record<string, unknown>>(
	values: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
	return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) as {
		[K in keyof T]?: Exclude<T[K], undefined>;
	};
}

/** The config as options of `bundle()` and of the renderer (see {@link LoadedMotioConfig}). */
function toNodeOptions(
	config: MotioConfig,
	rootDir: string,
): Pick<LoadedMotioConfig, "bundleOptions" | "sessionOptions"> {
	const at = (path: string | undefined) =>
		path === undefined ? undefined : resolve(rootDir, path);
	return {
		bundleOptions: {
			entryPoint: at(config.entryPoint) ?? "",
			rootDir,
			...defined({
				publicDir: at(config.publicDir),
				envFile: at(config.envFile),
				// The config types Vite's configuration loosely, so that `@motiojs/motio` needs no
				// Vite; the function receives and returns Vite's real configuration.
				viteOverride: config.vite as ViteOverrideFn | undefined,
				config: config.tailwind ? { tailwind: config.tailwind } : undefined,
			}),
		},
		sessionOptions: defined({
			browserExecutable: config.browser?.executable,
			timeoutInMilliseconds: config.browser?.timeoutMs,
			captureMethod: config.browser?.captureMethod,
			pagesPerBrowser: config.browser?.pagesPerBrowser,
			raster: config.browser?.raster,
			canvas: config.browser?.canvas,
			timeZone: config.browser?.timeZone,
			chromiumOptions: config.browser?.chromiumOptions,
			logLevel: config.logLevel,
			ffmpegExecutable: config.ffmpeg?.executable,
			ffprobeExecutable: config.ffmpeg?.ffprobeExecutable,
		}),
	};
}

/** Whether a file name is one of the Remotion config names (`remotion.config.ts`, ...). */
export function isRemotionConfigFile(path: string): boolean {
	return CONFIG_FILE_NAMES.includes(basename(path));
}

/** The first `motio.config.*` in the root, or `null`. */
export function findMotioConfigFile(rootDir: string): string | null {
	return MOTIO_CONFIG_FILE_NAMES.map((name) => join(rootDir, name)).find(existsSync) ?? null;
}

/**
 * Imports a config module (TypeScript and ESM through Vite's module runner, as the bundler
 * compiles the project) and returns its default export.
 */
async function importDefault(file: string, rootDir: string): Promise<unknown> {
	let module: { default?: unknown };
	try {
		({ module } = await runnerImport<{ default?: unknown }>(file, {
			root: rootDir,
			configFile: false,
			logLevel: "silent",
		}));
	} catch (error) {
		throw new MotioError(
			"E_CONFIG_LOAD",
			`Could not load ${file}: ${error instanceof Error ? error.message : String(error)}`,
			{ file },
			{ cause: error },
		);
	}
	if (!("default" in module)) {
		throw new MotioError(
			"E_INVALID_CONFIG",
			`${file} has no default export: write export default defineConfig({ ... }) with defineConfig from "@motiojs/motio/config". A file of Config setters from "@remotion/cli/config" must be named remotion.config.ts.`,
			{ file, problems: [] },
		);
	}
	return module.default;
}

/**
 * Loads `motio.config.ts` (or `.mts`, `.js`, `.mjs`, or `configFile`), validates it and applies
 * the `MOTIO_*` environment variables over it. The Node API never calls this by itself: call it
 * to render with the same settings as the CLI. Paths in the result are as written, relative to
 * the project root.
 */
export async function loadConfig(options: LoadMotioConfigOptions = {}): Promise<LoadedMotioConfig> {
	const rootDir = resolve(options.rootDir ?? process.cwd());
	let file: string | null;
	if (options.configFile) {
		file = isAbsolute(options.configFile) ? options.configFile : join(rootDir, options.configFile);
		if (!existsSync(file)) {
			throw new MotioError("E_CONFIG_NOT_FOUND", `The config file ${file} does not exist.`, {
				path: file,
			});
		}
	} else {
		file = findMotioConfigFile(rootDir);
	}
	const fromFile = file ? validateConfig(await importDefault(file, rootDir), file) : {};
	const env = options.env === undefined ? process.env : options.env;
	const config = env ? mergeConfig(fromFile, configFromEnv(env)) : fromFile;
	const ignoredFile =
		file && !options.configFile
			? (CONFIG_FILE_NAMES.map((name) => join(rootDir, name)).find(existsSync) ?? null)
			: null;
	return { file, config, ignoredFile, ...toNodeOptions(config, rootDir) };
}
