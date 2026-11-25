/**
 * The pinned FFmpeg builds. They are produced by `tools/ffmpeg-build/` in the Motio repository
 * from pinned, verified sources and published as GitHub Release assets together with those
 * sources, the scripts and the licence texts (D-065).
 */

/** FFmpeg release the archives contain. */
export const FFMPEG_VERSION = "8.1.3";

/** Build number of this set of archives; a rebuild of the same FFmpeg increments it. */
export const FFMPEG_BUILD = 1;

/** Owner of the GitHub repository that publishes the archives. */
export const RELEASE_OWNER = "essedev";

/**
 * Whether the release `RELEASE_TAG` is published with the archives whose digests are below.
 * Until it is, the default URL is refused before any request and downloads need
 * `MOTIO_FFMPEG_BASE_URL` (or `baseUrl`); it turns true together with the digests of the
 * published archives (D-065).
 */
export const RELEASE_PUBLISHED: boolean = true;

/** Tag of the GitHub Release that holds the archives. */
export const RELEASE_TAG = `ffmpeg-${FFMPEG_VERSION}-${FFMPEG_BUILD}`;

/** Where the archives are downloaded from unless `baseUrl` or `MOTIO_FFMPEG_BASE_URL` says else. */
export const DEFAULT_BASE_URL = `https://github.com/${RELEASE_OWNER}/motio/releases/download/${RELEASE_TAG}`;

/** Platforms with a build: Node's `process.platform` and `process.arch`, joined by a dash. */
export type FfmpegPlatform =
	| "darwin-arm64"
	| "darwin-x64"
	| "linux-arm64"
	| "linux-x64"
	| "win32-x64";

/** One archive of the release. */
export interface FfmpegArchive {
	/** File name in the release, `ffmpeg-<version>-<build>-<platform>.tar.gz`. */
	file: string;
	/** SHA-256 of the archive, lowercase hex. */
	sha256: string;
	/** Size in bytes. */
	size: number;
}

/**
 * The archive of each platform, or null for platforms whose build is not available yet (the
 * release workflow builds them; their digests are added when the release is published).
 */
export const FFMPEG_ARCHIVES: Readonly<Record<FfmpegPlatform, FfmpegArchive | null>> = {
	"darwin-arm64": {
		file: `ffmpeg-${FFMPEG_VERSION}-${FFMPEG_BUILD}-darwin-arm64.tar.gz`,
		sha256: "1f43f428f24bdcbf5e3f33bec7753543a692b4bc3e05fb04cb1fba0cf8d4354f",
		size: 34_218_748,
	},
	"darwin-x64": {
		file: `ffmpeg-${FFMPEG_VERSION}-${FFMPEG_BUILD}-darwin-x64.tar.gz`,
		sha256: "bc17d7b1e9cdfdfe4191c7052b96caa3e64c7fd621735342324556e8fd26f57c",
		size: 39_219_429,
	},
	"linux-arm64": {
		file: `ffmpeg-${FFMPEG_VERSION}-${FFMPEG_BUILD}-linux-arm64.tar.gz`,
		sha256: "858d3009ee9ed8e3aad03b18d1cd454482b1e61974816a733892b0a04aebb98a",
		size: 42_967_034,
	},
	"linux-x64": {
		file: `ffmpeg-${FFMPEG_VERSION}-${FFMPEG_BUILD}-linux-x64.tar.gz`,
		sha256: "d1ee419e3f0d305e9f92ca666bf34e985a83dbed88c0daee34761a664ef56355",
		size: 46_869_469,
	},
	"win32-x64": null,
};

/**
 * Encoders every build has and `ensureFfmpeg()` checks: everything Motio's codecs and audio
 * codecs use (H.264, H.265, AV1, VP8, VP9, ProRes, GIF, AAC, MP3, Opus, PCM) and the image
 * formats of the capture pipe.
 */
export const REQUIRED_ENCODERS = [
	"libx264",
	"libx265",
	"libsvtav1",
	"libvpx",
	"libvpx-vp9",
	"prores_ks",
	"gif",
	"png",
	"mjpeg",
	"aac",
	"libmp3lame",
	"libopus",
	"pcm_s16le",
] as const;
