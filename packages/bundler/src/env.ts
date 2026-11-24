import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { parseEnv } from "node:util";
import { MotioError } from "@motiojs/compat";

/** Prefix of the shell variables exposed to the bundle that Remotion projects use. */
export const ENV_PREFIX = "REMOTION_";

/** Prefixes of the shell variables exposed to the bundle: Motio's own, and Remotion's. */
export const ENV_PREFIXES: readonly string[] = ["MOTIO_", ENV_PREFIX];

/**
 * Variables that configure Motio's tools (FFmpeg, the browser, caches, and the config keys of
 * `CONFIG_ENV_VARIABLES`). They start with `MOTIO_` but are settings of the machine, not values
 * for the video, so they never reach the bundle.
 */
export const TOOL_VARIABLES: ReadonlySet<string> = new Set([
	"MOTIO_BROWSER_CACHE",
	"MOTIO_BROWSER_EXECUTABLE",
	"MOTIO_CAPTURE_METHOD",
	"MOTIO_CHROME_NO_SANDBOX",
	"MOTIO_CONCURRENCY",
	"MOTIO_FFMPEG",
	"MOTIO_FFMPEG_BASE_URL",
	"MOTIO_FFMPEG_CACHE",
	"MOTIO_FFPROBE",
	"MOTIO_GL",
	"MOTIO_LOG",
	"MOTIO_PAGES_PER_BROWSER",
	"MOTIO_TIMEOUT",
	"MOTIO_WHISPER_CPP",
]);

/** Whether a shell variable is exposed to the bundle. */
export function isBundleVariable(key: string): boolean {
	return ENV_PREFIXES.some((p) => key.startsWith(p)) && !TOOL_VARIABLES.has(key);
}

export interface LoadEnvOptions {
	/** Project root; the default `.env` / `.env.local` and relative `envFile` resolve here. */
	rootDir: string;
	/** `--env-file` or `Config.setDotEnvLocation()`; must exist when given. */
	envFile?: string | undefined;
	/** Shell environment to take `MOTIO_` and `REMOTION_` variables from. Defaults to `process.env`. */
	processEnv?: Record<string, string | undefined>;
}

export interface LoadedEnv {
	variables: Record<string, string>;
	/** Absolute path of the dotenv file read, or `null`. */
	file: string | null;
}

/**
 * Environment variables for the bundle: the dotenv file (an explicit `envFile`, else `.env`, else
 * `.env.local` in the root; only one is read) plus the shell variables starting with `MOTIO_` or
 * `REMOTION_` (except Motio's own tool settings, `TOOL_VARIABLES`), which win over the file.
 */
export function loadEnvVariables(options: LoadEnvOptions): LoadedEnv {
	let file: string | null = null;
	if (options.envFile) {
		file = isAbsolute(options.envFile) ? options.envFile : join(options.rootDir, options.envFile);
		if (!existsSync(file)) {
			throw new MotioError("E_ENV_FILE_NOT_FOUND", `The env file ${file} does not exist.`, {
				file,
			});
		}
	} else {
		file =
			[".env", ".env.local"]
				.map((name) => join(options.rootDir, name))
				.find((p) => existsSync(p)) ?? null;
	}
	const variables: Record<string, string> = {};
	if (file) {
		for (const [key, value] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
			if (typeof value === "string") variables[key] = value;
		}
	}
	for (const [key, value] of Object.entries(options.processEnv ?? process.env)) {
		if (isBundleVariable(key) && typeof value === "string") variables[key] = value;
	}
	return { variables, file };
}
