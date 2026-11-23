export { FfmpegError, type FfmpegErrorCode } from "./errors.js";
export {
	defaultFfmpegCacheDir,
	type EnsureFfmpegOptions,
	ensureFfmpeg,
	findFfmpeg,
	type InstalledFfmpeg,
} from "./install.js";
export {
	DEFAULT_BASE_URL,
	FFMPEG_ARCHIVES,
	FFMPEG_BUILD,
	FFMPEG_VERSION,
	type FfmpegArchive,
	type FfmpegPlatform,
	RELEASE_OWNER,
	RELEASE_TAG,
	REQUIRED_ENCODERS,
} from "./manifest.js";
export { ffmpegPlatform } from "./platform.js";
