/**
 * `@motiojs/compat/config`: the replacement for `@remotion/cli/config`, imported by
 * `remotion.config.ts`.
 */
export {
	CONFIG_SETTERS,
	Config,
	type ConfigObject,
	type ConfigSetters,
	getSetterSupport,
} from "./config.js";
export {
	type ConfigSnapshot,
	type ConfigWarning,
	type ConfigWarningReason,
	getConfigValues,
	getConfigWarnings,
	resetConfig,
	snapshotConfig,
} from "./store.js";
export {
	CHROME_MODES,
	type ChromeMode,
	CODECS,
	COLOR_SPACES,
	type Codec,
	type ColorSpace,
	type Concurrency,
	type ConfigValues,
	type FrameRange,
	GL_RENDERERS,
	type GlRenderer,
	HARDWARE_ACCELERATION,
	type HardwareAcceleration,
	LOG_LEVELS,
	type LogLevel,
	PIXEL_FORMATS,
	type PixelFormat,
	PRORES_PROFILES,
	type ProResProfile,
	STILL_IMAGE_FORMATS,
	type StillImageFormat,
	VIDEO_IMAGE_FORMATS,
	type VideoImageFormat,
	type WebpackOverrideFn,
	X264_PRESETS,
	type X264Preset,
} from "./values.js";
export { analyzeWebpackOverrides, type WebpackOverrideAnalysis } from "./webpack.js";
