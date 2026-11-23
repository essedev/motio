import { FFMPEG_ARCHIVES, type FfmpegPlatform } from "./manifest.js";

/** The `FfmpegPlatform` of a Node platform and architecture, or null when there is none. */
export function ffmpegPlatform(
	platform: NodeJS.Platform = process.platform,
	arch: string = process.arch,
): FfmpegPlatform | null {
	const key = `${platform}-${arch}`;
	return Object.hasOwn(FFMPEG_ARCHIVES, key) ? (key as FfmpegPlatform) : null;
}

/** File names of the executables on a platform. */
export function executableNames(platform: FfmpegPlatform): { ffmpeg: string; ffprobe: string } {
	const suffix = platform.startsWith("win32") ? ".exe" : "";
	return { ffmpeg: `ffmpeg${suffix}`, ffprobe: `ffprobe${suffix}` };
}
