import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { MotioError, motioCompat } from "@motiojs/compat";
import {
	analyzeWebpackOverrides,
	type ConfigSnapshot,
	resetConfig,
	snapshotConfig,
} from "@motiojs/compat/config";
import { runnerImport } from "vite";
import { compatAliases } from "./compat-aliases.js";

/** Config file names looked up in the project root, in order. */
export const CONFIG_FILE_NAMES: readonly string[] = [
	"remotion.config.ts",
	"remotion.config.mts",
	"remotion.config.js",
	"remotion.config.mjs",
];

export interface LoadConfigOptions {
	rootDir: string;
	/** `--config`: a path to the config file; must exist when given. */
	configFile?: string | undefined;
}

export interface LoadedConfig extends ConfigSnapshot {
	/** Absolute path of the file loaded, or `null` when the project has none. */
	file: string | null;
}

/** Finds the config file: the explicit path, else the first default name in the root. */
export function findConfigFile(options: LoadConfigOptions): string | null {
	if (options.configFile) {
		const path = isAbsolute(options.configFile)
			? options.configFile
			: join(options.rootDir, options.configFile);
		if (!existsSync(path)) {
			throw new MotioError("E_CONFIG_NOT_FOUND", `The config file ${path} does not exist.`, {
				path,
			});
		}
		return path;
	}
	return CONFIG_FILE_NAMES.map((name) => join(options.rootDir, name)).find(existsSync) ?? null;
}

/**
 * Runs `remotion.config.ts` (TypeScript and ESM through Vite's module runner, with
 * `@remotion/cli/config` mapped to `@motiojs/compat/config`) and returns what its setters
 * recorded. The values also stay in the shared config store, where `bundle()` reads them.
 */
export async function loadRemotionConfig(options: LoadConfigOptions): Promise<LoadedConfig> {
	resetConfig();
	const file = findConfigFile(options);
	if (!file) return { file: null, values: {}, warnings: [] };
	try {
		await runnerImport(file, {
			root: options.rootDir,
			configFile: false,
			logLevel: "silent",
			plugins: [motioCompat({ symbols: "off", aliases: compatAliases() })],
		});
	} catch (error) {
		if (error instanceof MotioError) throw error;
		throw new MotioError(
			"E_CONFIG_LOAD",
			`Could not load ${file}: ${error instanceof Error ? error.message : String(error)}`,
			{ file },
			{ cause: error },
		);
	}
	return { file, ...(await refineWebpackOverrides(snapshotConfig())) };
}

/**
 * Replaces the generic warning of `overrideWebpackConfig` with what the overrides actually do:
 * an override that only calls `enableTailwind` needs no warning, any other change gets one.
 */
async function refineWebpackOverrides(snapshot: ConfigSnapshot): Promise<ConfigSnapshot> {
	const overrides = snapshot.values.webpackOverrides ?? [];
	if (overrides.length === 0) return snapshot;
	const analysis = await analyzeWebpackOverrides(overrides);
	const isOverrideWarning = (setter: string) =>
		setter === "overrideWebpackConfig" || setter === "overrideBundlerConfig";
	return {
		values: {
			...snapshot.values,
			...(analysis.tailwind && !snapshot.values.tailwind ? { tailwind: analysis.tailwind } : {}),
		},
		warnings: [
			...snapshot.warnings.filter((w) => !isOverrideWarning(w.setter)),
			...analysis.warnings,
		],
	};
}
