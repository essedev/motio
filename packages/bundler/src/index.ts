/**
 * A Webpack override as written in `remotion.config.ts` (`Config.overrideWebpackConfig()`):
 * Motio reads it to detect Tailwind; `bundle()` rejects a `webpackOverride` (use `viteOverride`).
 */
export type { WebpackOverrideFn } from "@motiojs/compat/config";
export {
	BUNDLE_GLOBAL,
	type BundleOptions,
	type BundleResult,
	bundle,
	createBundle,
	DEFAULT_RUNTIME_MODULE,
	type LegacyBundleOptions,
	PROCESS_ENV_GLOBAL,
	PUBLIC_SUBDIR,
	type ViteOverrideFn,
} from "./bundle.js";
export {
	CONFIG_FILE_NAMES,
	findConfigFile,
	type LoadConfigOptions,
	type LoadedConfig,
	loadRemotionConfig,
} from "./config-file.js";
export {
	DEFAULT_DEV_PORT,
	DEFAULT_PREVIEW_MODULE,
	DEV_API_PREFIX,
	type DevLogLevel,
	type DevServer,
	type DevServerOptions,
	type DevStillHandler,
	type DevStillRequest,
	type DevStillResult,
	parseStillRequest,
	startDevServer,
} from "./dev-server.js";
export {
	ENTRY_POINT_CANDIDATES,
	type EntryPointReason,
	type ResolvedEntryPoint,
	type ResolveEntryPointOptions,
	resolveEntryPoint,
} from "./entry-point.js";
export { ENV_PREFIX, type LoadEnvOptions, type LoadedEnv, loadEnvVariables } from "./env.js";
export { encodeStaticPath, STATIC_FILES_LIMIT, type StaticFile } from "./public-dir.js";
export { listStaticFiles } from "./static-files.js";
