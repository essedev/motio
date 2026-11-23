import { MotioError } from "../errors.js";
import { readTailwindMarker } from "../tailwind.js";
import {
	addConfigWarning,
	type ConfigWarningReason,
	getConfigValues,
	setConfigValue,
} from "./store.js";
import {
	isBoolean,
	isBooleanRecord,
	isCommaSeparatedIntegers,
	isConcurrency,
	isFlagRecord,
	isFrameRange,
	isJpegQuality,
	isNonNegativeInteger,
	isPositiveInteger,
	isPositiveNumber,
	isScale,
	isString,
	isStringRecord,
	nullable,
	oneOf,
	type Validator,
} from "./validate.js";
import {
	CHROME_MODES,
	CODECS,
	COLOR_SPACES,
	type ConfigValues,
	GL_RENDERERS,
	HARDWARE_ACCELERATION,
	LOG_LEVELS,
	PIXEL_FORMATS,
	PRORES_PROFILES,
	STILL_IMAGE_FORMATS,
	VIDEO_IMAGE_FORMATS,
	type WebpackOverrideFn,
	X264_PRESETS,
} from "./values.js";

const MESSAGES: Record<Exclude<ConfigWarningReason, "no-equivalent" | "deprecated">, string> = {
	planned: "is recorded but Motio does not use it yet, so it has no effect",
	studio:
		"configures Remotion Studio, which Motio does not have (`motio dev` is the preview page); it has no effect",
	cloud:
		"configures Remotion Lambda or Cloud Run; Motio's distributed rendering is planned for M5, so it has no effect",
};

/** How each setter is handled: `supported`, or the reason it has no full effect. */
const SUPPORT = new Map<string, "supported" | ConfigWarningReason>();

function warn(setter: string, reason: ConfigWarningReason, message?: string): void {
	const text =
		message ??
		`Config.${setter}() ${MESSAGES[reason as keyof typeof MESSAGES] ?? "has no effect in Motio"}.`;
	addConfigWarning({ setter, reason, message: text });
}

function invalid(setter: string, value: unknown, expected: string): never {
	throw new MotioError(
		"E_INVALID_CONFIG",
		`Config.${setter}() received ${describe(value)}; expected ${expected}. Fix remotion.config.ts.`,
		{ setter, value: describe(value) },
	);
}

function describe(value: unknown): string {
	if (typeof value === "function") return "a function";
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

/** A setter whose value Motio reads. Invalid values throw `E_INVALID_CONFIG`. */
function supported<K extends keyof ConfigValues>(
	setter: string,
	key: K,
	validate: Validator<ConfigValues[K]>,
	expected: string,
): (value: ConfigValues[K]) => void {
	SUPPORT.set(setter, "supported");
	return (value) => {
		if (!validate(value)) invalid(setter, value, expected);
		setConfigValue(key, value);
	};
}

/**
 * A setter Motio records without using it yet (or that only matters elsewhere): the value is
 * kept when valid, a warning is recorded, and nothing throws.
 */
function recorded<K extends keyof ConfigValues>(
	setter: string,
	key: K,
	validate: Validator<ConfigValues[K]>,
	reason: ConfigWarningReason = "planned",
	message?: string,
): (value: ConfigValues[K]) => void {
	SUPPORT.set(setter, reason);
	return (value) => {
		if (validate(value)) setConfigValue(key, value);
		warn(setter, reason, message);
	};
}

/** A setter with nothing to record in Motio: only the warning. */
function ignored(
	setter: string,
	reason: ConfigWarningReason,
	message?: string,
): (...args: unknown[]) => void {
	SUPPORT.set(setter, reason);
	return () => warn(setter, reason, message);
}

const NO_WEBPACK =
	"Motio bundles with Vite, so webpack overrides have no equivalent (docs/DECISIONS.md D-003). " +
	"Tailwind through enableTailwind() is recognised; anything else must be redone with a Vite plugin.";

const FRAME_RANGE_EXPECTED =
	"a frame number, a [start, end] or [start, null] range, or a list of those";

/** Records webpack overrides; the bundler analyses them (see `analyzeWebpackOverrides`). */
function overrideWebpackConfig(setter: string) {
	SUPPORT.set(setter, "no-equivalent");
	return (override: WebpackOverrideFn): void => {
		if (typeof override !== "function") invalid(setter, override, "a function");
		const tailwind = readTailwindMarker(override);
		if (tailwind) {
			setConfigValue("tailwind", tailwind);
			return;
		}
		setConfigValue("webpackOverrides", [...(getConfigValues().webpackOverrides ?? []), override]);
		warn(setter, "no-equivalent", `Config.${setter}(): ${NO_WEBPACK}`);
	};
}

const setters = {
	// Bundling
	overrideWebpackConfig: overrideWebpackConfig("overrideWebpackConfig"),
	overrideBundlerConfig: overrideWebpackConfig("overrideBundlerConfig"),
	overrideRspackConfig: ignored(
		"overrideRspackConfig",
		"no-equivalent",
		`Config.overrideRspackConfig(): ${NO_WEBPACK}`,
	),
	setRspack: ignored(
		"setRspack",
		"no-equivalent",
		"Config.setRspack() has no effect: Motio bundles with Vite (D-003).",
	),
	setExperimentalRspackEnabled: ignored(
		"setExperimentalRspackEnabled",
		"no-equivalent",
		"Config.setExperimentalRspackEnabled() has no effect: Motio bundles with Vite (D-003).",
	),
	setWebpackPollingInMilliseconds: ignored(
		"setWebpackPollingInMilliseconds",
		"no-equivalent",
		"Config.setWebpackPollingInMilliseconds() has no effect: configure `server.watch` of Vite instead.",
	),
	setCachingEnabled: recorded(
		"setCachingEnabled",
		"cachingEnabled",
		isBoolean,
		"no-equivalent",
		"Config.setCachingEnabled() has no effect: Motio's Vite build keeps no persistent cache.",
	),
	setEntryPoint: supported("setEntryPoint", "entryPoint", isString, "a path to the entry file"),
	setPublicDir: supported("setPublicDir", "publicDir", isString, "a path to the public directory"),
	setPublicPath: supported(
		"setPublicPath",
		"publicPath",
		isString,
		"a URL path such as `/` or `./`",
	),
	setBundleOutDir: recorded("setBundleOutDir", "bundleOutDir", isString),
	setDotEnvLocation: supported(
		"setDotEnvLocation",
		"dotEnvLocation",
		isString,
		"a path to a .env file",
	),

	// Rendering
	setConcurrency: supported(
		"setConcurrency",
		"concurrency",
		nullable(isConcurrency),
		'a positive integer, a percentage such as "50%", or null',
	),
	setVideoImageFormat: supported(
		"setVideoImageFormat",
		"videoImageFormat",
		oneOf(VIDEO_IMAGE_FORMATS),
		VIDEO_IMAGE_FORMATS.join(", "),
	),
	setStillImageFormat: supported(
		"setStillImageFormat",
		"stillImageFormat",
		oneOf(STILL_IMAGE_FORMATS),
		STILL_IMAGE_FORMATS.join(", "),
	),
	setJpegQuality: supported(
		"setJpegQuality",
		"jpegQuality",
		isJpegQuality,
		"an integer from 0 to 100",
	),
	setScale: supported("setScale", "scale", isScale, "a number above 0 and at most 16"),
	setMuted: supported("setMuted", "muted", isBoolean, "a boolean"),
	setCodec: supported("setCodec", "codec", oneOf(CODECS), CODECS.join(", ")),
	setAudioCodec: supported("setAudioCodec", "audioCodec", isString, "an audio codec name"),
	setCrf: supported("setCrf", "crf", isNonNegativeInteger, "a non-negative integer"),
	setPixelFormat: supported(
		"setPixelFormat",
		"pixelFormat",
		oneOf(PIXEL_FORMATS),
		PIXEL_FORMATS.join(", "),
	),
	setColorSpace: supported(
		"setColorSpace",
		"colorSpace",
		oneOf(COLOR_SPACES),
		COLOR_SPACES.join(", "),
	),
	setX264Preset: supported(
		"setX264Preset",
		"x264Preset",
		oneOf(X264_PRESETS),
		X264_PRESETS.join(", "),
	),
	setEveryNthFrame: supported(
		"setEveryNthFrame",
		"everyNthFrame",
		isPositiveInteger,
		"a positive integer",
	),
	setFrameRange: supported(
		"setFrameRange",
		"frameRange",
		nullable(isFrameRange),
		FRAME_RANGE_EXPECTED,
	),
	setOutputLocation: supported("setOutputLocation", "outputLocation", isString, "a file path"),
	setOverwriteOutput: supported("setOverwriteOutput", "overwriteOutput", isBoolean, "a boolean"),
	setProResProfile: recorded("setProResProfile", "proResProfile", oneOf(PRORES_PROFILES)),
	setProResBitsPerMacroblock: recorded(
		"setProResBitsPerMacroblock",
		"proResBitsPerMacroblock",
		nullable(isPositiveInteger),
	),
	setImageSequence: recorded("setImageSequence", "imageSequence", isBoolean),
	setImageSequencePattern: recorded("setImageSequencePattern", "imageSequencePattern", isString),
	setNumberOfGifLoops: recorded(
		"setNumberOfGifLoops",
		"numberOfGifLoops",
		nullable(isNonNegativeInteger),
	),
	setVideoBitrate: recorded("setVideoBitrate", "videoBitrate", nullable(isString)),
	setAudioBitrate: supported(
		"setAudioBitrate",
		"audioBitrate",
		nullable(isString),
		'an FFmpeg bitrate such as "128k", or null',
	),
	setEncodingBufferSize: recorded(
		"setEncodingBufferSize",
		"encodingBufferSize",
		nullable(isString),
	),
	setEncodingMaxRate: recorded("setEncodingMaxRate", "encodingMaxRate", nullable(isString)),
	setGopSize: recorded("setGopSize", "gopSize", nullable(isPositiveInteger)),
	setEnforceAudioTrack: supported(
		"setEnforceAudioTrack",
		"enforceAudioTrack",
		isBoolean,
		"a boolean",
	),
	setSampleRate: supported("setSampleRate", "sampleRate", isPositiveInteger, "a positive integer"),
	setMetadata: recorded("setMetadata", "metadata", isStringRecord),
	setHardwareAcceleration: recorded(
		"setHardwareAcceleration",
		"hardwareAcceleration",
		oneOf(HARDWARE_ACCELERATION),
	),
	setDisallowParallelEncoding: recorded(
		"setDisallowParallelEncoding",
		"disallowParallelEncoding",
		isBoolean,
	),
	setForSeamlessAacConcatenation: recorded(
		"setForSeamlessAacConcatenation",
		"forSeamlessAacConcatenation",
		isBoolean,
	),
	setPreferLosslessAudio: supported(
		"setPreferLosslessAudio",
		"preferLosslessAudio",
		isBoolean,
		"a boolean",
	),
	setDisableSharedMemoryCapture: ignored(
		"setDisableSharedMemoryCapture",
		"no-equivalent",
		"Config.setDisableSharedMemoryCapture() has no effect: Motio always captures with screenshots.",
	),
	overrideFfmpegCommand: ignored(
		"overrideFfmpegCommand",
		"no-equivalent",
		"Config.overrideFfmpegCommand() has no effect: Motio builds its own FFmpeg arguments.",
	),
	setBinariesDirectory: ignored(
		"setBinariesDirectory",
		"no-equivalent",
		"Config.setBinariesDirectory() has no effect: Motio runs the ffmpeg and ffprobe found on PATH (D-002).",
	),

	// Composition overrides
	overrideWidth: supported("overrideWidth", "width", isPositiveInteger, "a positive integer"),
	overrideHeight: supported("overrideHeight", "height", isPositiveInteger, "a positive integer"),
	overrideFps: supported("overrideFps", "fps", isPositiveNumber, "a positive number"),
	overrideDuration: supported(
		"overrideDuration",
		"durationInFrames",
		isPositiveInteger,
		"a positive integer",
	),

	// Browser
	setBrowserExecutable: supported(
		"setBrowserExecutable",
		"browserExecutable",
		nullable(isString),
		"a path to a Chrome executable, or null",
	),
	setDelayRenderTimeoutInMilliseconds: supported(
		"setDelayRenderTimeoutInMilliseconds",
		"delayRenderTimeoutInMilliseconds",
		isPositiveNumber,
		"a positive number of milliseconds",
	),
	setChromiumOpenGlRenderer: supported(
		"setChromiumOpenGlRenderer",
		"chromiumOpenGlRenderer",
		nullable(oneOf(GL_RENDERERS)),
		`${GL_RENDERERS.join(", ")} or null`,
	),
	setChromiumFlags: recorded("setChromiumFlags", "chromiumFlags", isFlagRecord),
	setChromiumFeatures: recorded("setChromiumFeatures", "chromiumFeatures", isBooleanRecord),
	setChromiumBlinkFeatures: recorded(
		"setChromiumBlinkFeatures",
		"chromiumBlinkFeatures",
		isBooleanRecord,
	),
	setChromiumDisableWebSecurity: supported(
		"setChromiumDisableWebSecurity",
		"chromiumDisableWebSecurity",
		isBoolean,
		"a boolean",
	),
	setChromiumIgnoreCertificateErrors: supported(
		"setChromiumIgnoreCertificateErrors",
		"chromiumIgnoreCertificateErrors",
		isBoolean,
		"a boolean",
	),
	setChromiumHeadlessMode: supported(
		"setChromiumHeadlessMode",
		"chromiumHeadlessMode",
		isBoolean,
		"a boolean",
	),
	setChromiumDarkMode: supported("setChromiumDarkMode", "chromiumDarkMode", isBoolean, "a boolean"),
	setChromiumUserAgent: supported(
		"setChromiumUserAgent",
		"chromiumUserAgent",
		nullable(isString),
		"a user agent string, or null",
	),
	setChromiumMultiProcessOnLinux: recorded(
		"setChromiumMultiProcessOnLinux",
		"chromiumMultiProcessOnLinux",
		isBoolean,
		"no-equivalent",
		"Config.setChromiumMultiProcessOnLinux() has no effect: Motio gives each page its own browser process (D-007).",
	),
	setChromeMode: recorded("setChromeMode", "chromeMode", oneOf(CHROME_MODES)),
	setOffthreadVideoCacheSizeInBytes: recorded(
		"setOffthreadVideoCacheSizeInBytes",
		"offthreadVideoCacheSizeInBytes",
		nullable(isPositiveInteger),
	),

	// Misc
	setLogLevel: supported("setLogLevel", "logLevel", oneOf(LOG_LEVELS), LOG_LEVELS.join(", ")),
	setRendererPort: recorded("setRendererPort", "rendererPort", nullable(isPositiveInteger)),
	setStudioPort: recorded("setStudioPort", "studioPort", nullable(isPositiveInteger), "studio"),
	setPort: recorded(
		"setPort",
		"rendererPort",
		nullable(isPositiveInteger),
		"deprecated",
		"Config.setPort() is deprecated: use setRendererPort() and setStudioPort(). Motio picks a free port and ignores it for now.",
	),
	setBenchmarkRuns: recorded("setBenchmarkRuns", "benchmarkRuns", isPositiveInteger),
	setBenchmarkConcurrencies: recorded(
		"setBenchmarkConcurrencies",
		"benchmarkConcurrencies",
		isCommaSeparatedIntegers,
	),
	setPublicLicenseKey: ignored(
		"setPublicLicenseKey",
		"no-equivalent",
		"Config.setPublicLicenseKey() has no effect: Motio is Apache-2.0 and needs no licence key.",
	),
	setRepro: ignored(
		"setRepro",
		"no-equivalent",
		"Config.setRepro() has no effect: Motio has no reproduction archive yet.",
	),
	setPreferredEffectBackend: ignored("setPreferredEffectBackend", "planned"),

	// Remotion Studio only
	addElementLibrary: ignored("addElementLibrary", "studio"),
	setMaxTimelineTracks: ignored("setMaxTimelineTracks", "studio"),
	setKeyboardShortcutsEnabled: ignored("setKeyboardShortcutsEnabled", "studio"),
	setKeyboardShortcuts: ignored("setKeyboardShortcuts", "studio"),
	setInteractivityEnabled: ignored("setInteractivityEnabled", "studio"),
	setPreservePitchOnPlayback: ignored("setPreservePitchOnPlayback", "studio"),
	setCanvasTabsEnabled: ignored("setCanvasTabsEnabled", "studio"),
	setSequenceActivityLimit: ignored("setSequenceActivityLimit", "studio"),
	setHighContrast: ignored("setHighContrast", "studio"),
	setShowDiagnostics: ignored("setShowDiagnostics", "studio"),
	setShowLayerFrameNumbers: ignored("setShowLayerFrameNumbers", "studio"),
	setShowPremounting: ignored("setShowPremounting", "studio"),
	setDefaultPremountInSeconds: ignored("setDefaultPremountInSeconds", "studio"),
	setDefaultEditor: ignored("setDefaultEditor", "studio"),
	setDefaultCodingAgent: ignored("setDefaultCodingAgent", "studio"),
	setAllowHtmlInCanvasEnabled: ignored("setAllowHtmlInCanvasEnabled", "studio"),
	setNumberOfSharedAudioTags: ignored("setNumberOfSharedAudioTags", "studio"),
	setShouldOpenBrowser: ignored("setShouldOpenBrowser", "studio"),
	setPreviewSampleRate: ignored("setPreviewSampleRate", "studio"),
	setAudioLatencyHint: ignored("setAudioLatencyHint", "studio"),
	setExperimentalKeepAudioContextAlive: ignored("setExperimentalKeepAudioContextAlive", "studio"),
	setBeepOnFinish: ignored("setBeepOnFinish", "studio"),
	setEnableCrossSiteIsolation: ignored("setEnableCrossSiteIsolation", "studio"),
	setAskAIEnabled: ignored("setAskAIEnabled", "studio"),
	setForceNewStudioEnabled: ignored("setForceNewStudioEnabled", "studio"),
	setIPv4: ignored("setIPv4", "studio"),
	setBufferStateDelayInMilliseconds: ignored("setBufferStateDelayInMilliseconds", "studio"),

	// Remotion Lambda and Cloud Run
	setEnableFolderExpiry: ignored("setEnableFolderExpiry", "cloud"),
	setEnableCancellation: ignored("setEnableCancellation", "cloud"),
	setLambdaInsights: ignored("setLambdaInsights", "cloud"),
	setDeleteAfter: ignored("setDeleteAfter", "cloud"),

	// Removed or renamed before the compatibility target
	setQuality: (value: number): void => {
		if (isJpegQuality(value)) setConfigValue("jpegQuality", value);
		warn(
			"setQuality",
			"deprecated",
			"Config.setQuality() was renamed to setJpegQuality() in Remotion 4.0; the value was applied as the JPEG quality.",
		);
	},
	setImageFormat: ignored(
		"setImageFormat",
		"deprecated",
		"Config.setImageFormat() was removed in Remotion 4.0: use setVideoImageFormat() or setStillImageFormat().",
	),
	setOutputFormat: ignored(
		"setOutputFormat",
		"deprecated",
		"Config.setOutputFormat() was removed in Remotion 4.0: use setCodec() and setImageSequence().",
	),
	setFfmpegExecutable: ignored(
		"setFfmpegExecutable",
		"deprecated",
		"Config.setFfmpegExecutable() was removed in Remotion 4.0; Motio runs the ffmpeg found on PATH (D-002).",
	),
	setFfprobeExecutable: ignored(
		"setFfprobeExecutable",
		"deprecated",
		"Config.setFfprobeExecutable() was removed in Remotion 4.0; Motio runs the ffprobe found on PATH (D-002).",
	),
};

/** The setters of `remotion.config.ts`, as documented for the compatibility target. */
export type ConfigSetters = typeof setters;

/**
 * Pre-3.3.39 nested groups (`Config.Bundling.setCachingEnabled()`, `Config.Rendering...`):
 * each group exposes every setter, as the flat form does.
 */
export interface ConfigObject extends ConfigSetters {
	readonly Bundling: ConfigSetters;
	readonly Log: ConfigSetters;
	readonly Output: ConfigSetters;
	readonly Preview: ConfigSetters;
	readonly Puppeteer: ConfigSetters;
	readonly Rendering: ConfigSetters;
}

/**
 * `Config` as imported from `@remotion/cli/config` in `remotion.config.ts`. Setters record
 * values in the config store read by `@motiojs/bundler` and the `motio` CLI; setters Motio
 * does not support record a warning instead of throwing.
 */
export const Config: ConfigObject = {
	...setters,
	Bundling: setters,
	Log: setters,
	Output: setters,
	Preview: setters,
	Puppeteer: setters,
	Rendering: setters,
};

/** Names of every setter, for documentation and the compatibility report. */
export const CONFIG_SETTERS: readonly string[] = Object.keys(setters);

SUPPORT.set("setQuality", "deprecated");

/** How Motio handles a setter: `supported`, a warning reason, or `undefined` if unknown. */
export function getSetterSupport(setter: string): "supported" | ConfigWarningReason | undefined {
	return SUPPORT.get(setter);
}
