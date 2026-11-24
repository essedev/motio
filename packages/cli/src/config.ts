import { relative } from "node:path";
import {
	configFromEnv,
	findMotioConfigFile,
	isRemotionConfigFile,
	type MotioConfig,
	type ViteOverrideFn,
} from "@motiojs/bundler";
import type { ConfigValues } from "@motiojs/compat/config";
import type { CommandContext } from "./context.js";
import { resolvePath } from "./options.js";

/** Which command reads the config: `still` takes `scale`, `jpegQuality` and `overwrite` from `still`. */
export type ConfigPurpose = "render" | "still";

/** The project's settings, from the config file and the `MOTIO_*` variables. */
export interface ProjectConfig {
	/** `motio` for `motio.config.*`, `remotion` for `remotion.config.*`, null without a file. */
	kind: "motio" | "remotion" | null;
	/** Absolute path of the file read, or null. */
	file: string | null;
	/**
	 * The settings in the shape every command reads (shared with `remotion.config.ts`), with the
	 * environment variables applied. Flags still win over them.
	 */
	values: Partial<ConfigValues>;
	/** The Motio settings with the environment applied; for a Remotion config, only the environment. */
	motio: MotioConfig;
	/** Messages about settings without full effect (Remotion configs), printed by the commands. */
	warnings: Array<{ setter: string; message: string }>;
}

/** Drops undefined entries, for `exactOptionalPropertyTypes`. */
const defined = <T extends Record<string, unknown>>(
	values: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } =>
	Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) as {
		[K in keyof T]?: Exclude<T[K], undefined>;
	};

/**
 * Maps the Motio settings to the values the commands read. `scale`, `jpegQuality` and
 * `overwrite` exist in both `render` and `still`; `purpose` picks the group.
 */
export function toConfigValues(
	config: MotioConfig,
	purpose: ConfigPurpose = "render",
): Partial<ConfigValues> {
	const render = config.render ?? {};
	const still = config.still ?? {};
	const browser = config.browser ?? {};
	const chromium = browser.chromiumOptions ?? {};
	const shared = purpose === "still" ? still : render;
	return defined({
		entryPoint: config.entryPoint,
		publicDir: config.publicDir,
		dotEnvLocation: config.envFile,
		logLevel: config.logLevel,
		tailwind: config.tailwind,
		codec: render.codec,
		crf: render.crf,
		concurrency: render.concurrency,
		videoImageFormat: render.imageFormat,
		stillImageFormat: still.imageFormat,
		jpegQuality: shared.jpegQuality,
		scale: shared.scale,
		overwriteOutput: shared.overwrite,
		muted: render.muted,
		pixelFormat: render.pixelFormat,
		colorSpace: render.colorSpace,
		x264Preset: render.x264Preset,
		proResProfile: render.proResProfile,
		numberOfGifLoops: render.numberOfGifLoops,
		everyNthFrame: render.everyNthFrame,
		audioCodec: render.audioCodec,
		audioBitrate: render.audioBitrate,
		sampleRate: render.sampleRate,
		enforceAudioTrack: render.enforceAudioTrack,
		preferLosslessAudio: render.preferLossless,
		imageSequencePattern: render.imageSequencePattern,
		browserExecutable: browser.executable,
		delayRenderTimeoutInMilliseconds: browser.timeoutMs,
		chromiumOpenGlRenderer: chromium.gl,
		chromiumUserAgent: chromium.userAgent,
		chromiumIgnoreCertificateErrors: chromium.ignoreCertificateErrors,
		chromiumDisableWebSecurity: chromium.disableWebSecurity,
		chromiumDarkMode: chromium.darkMode,
		chromiumHeadlessMode: chromium.headless,
		studioPort: config.dev?.port,
	});
}

/**
 * Loads the project's config: `--config <path>` (a `remotion.config.*` name is read as a
 * Remotion config, any other as a Motio config), else `motio.config.*` in the root, else
 * `remotion.config.*`. When both exist the Motio one wins with a warning naming the other.
 * The `MOTIO_*` variables of `CONFIG_ENV_VARIABLES` apply over either file.
 */
export async function loadProjectConfig(
	ctx: CommandContext,
	options: { rootDir: string; configFlag: string | undefined; purpose?: ConfigPurpose },
): Promise<ProjectConfig> {
	const { rootDir } = options;
	const purpose = options.purpose ?? "render";
	const configFile = options.configFlag ? resolvePath(ctx.io.cwd, options.configFlag) : undefined;
	const motioFile = configFile
		? isRemotionConfigFile(configFile)
			? null
			: configFile
		: findMotioConfigFile(rootDir);

	if (motioFile) {
		// Without --config, loadConfig looks the file up itself and reports a remotion.config.* it skipped.
		const loaded = await ctx.bundler.loadConfig({ rootDir, configFile, env: ctx.io.env });
		ctx.reporter.verbose(`Loaded config from ${motioFile}`);
		if (loaded.ignoredFile) {
			const shown = (path: string) => relative(ctx.io.cwd, path) || path;
			ctx.reporter.warn(
				`Using ${shown(motioFile)}; ${shown(loaded.ignoredFile)} is ignored. Move its settings to the Motio config and delete it.`,
			);
		}
		return {
			kind: "motio",
			file: motioFile,
			values: toConfigValues(loaded.config, purpose),
			motio: loaded.config,
			warnings: [],
		};
	}

	const loaded = await ctx.bundler.loadRemotionConfig({ rootDir, configFile });
	if (loaded.file) ctx.reporter.verbose(`Loaded config from ${loaded.file}`);
	const fromEnv = configFromEnv(ctx.io.env);
	return {
		kind: loaded.file ? "remotion" : null,
		file: loaded.file,
		values: { ...loaded.values, ...toConfigValues(fromEnv, purpose) },
		motio: fromEnv,
		warnings: loaded.warnings,
	};
}

/** The `vite` function of the config, typed for the bundler. */
export function viteOverrideOf(config: ProjectConfig): ViteOverrideFn | undefined {
	// The config types Vite's configuration loosely so that `@motiojs/motio` needs no Vite; the
	// function receives and returns Vite's real configuration.
	return config.motio.vite as ViteOverrideFn | undefined;
}
