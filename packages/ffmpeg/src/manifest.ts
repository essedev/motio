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
export const RELEASE_PUBLISHED: boolean = false;

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
		sha256: "f8db3d0520742bbaad08d01309af58c468b18bde89b9344a3f6bafcfc090543b",
		size: 35_367_156,
	},
	"darwin-x64": {
		file: `ffmpeg-${FFMPEG_VERSION}-${FFMPEG_BUILD}-darwin-x64.tar.gz`,
		sha256: "2f6a8bcfb515f152286700a2dd41da27631b6d1dd47309335e6d07d55ab6fff9",
		size: 39_960_587,
	},
	"linux-arm64": {
		file: `ffmpeg-${FFMPEG_VERSION}-${FFMPEG_BUILD}-linux-arm64.tar.gz`,
		sha256: "05dc0745846b8d489e0e8981bcb5f83cbc8973f27c912e76a1a35b87c35cd9cc",
		size: 42_966_756,
	},
	"linux-x64": {
		file: `ffmpeg-${FFMPEG_VERSION}-${FFMPEG_BUILD}-linux-x64.tar.gz`,
		sha256: "126555c701b5e6fab26fe53be76a6e9d54f202acac17ab7d3f7b7e79cd1fa787",
		size: 46_869_866,
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
