import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { parseEnv } from "node:util";
import { MotioError } from "@motiojs/compat";

/** Prefix of the shell variables exposed to the bundle, as in Remotion. */
export const ENV_PREFIX = "REMOTION_";

export interface LoadEnvOptions {
	/** Project root; the default `.env` / `.env.local` and relative `envFile` resolve here. */
	rootDir: string;
	/** `--env-file` or `Config.setDotEnvLocation()`; must exist when given. */
	envFile?: string | undefined;
	/** Shell environment to take `REMOTION_` variables from. Defaults to `process.env`. */
	processEnv?: Record<string, string | undefined>;
}

export interface LoadedEnv {
	variables: Record<string, string>;
	/** Absolute path of the dotenv file read, or `null`. */
	file: string | null;
}

/**
 * Environment variables for the bundle, following Remotion's rules: the dotenv file (an
 * explicit `envFile`, else `.env`, else `.env.local` in the root; only one is read) plus the
 * shell variables starting with `REMOTION_`, which win over the file.
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
		if (key.startsWith(ENV_PREFIX) && typeof value === "string") variables[key] = value;
	}
	return { variables, file };
}
