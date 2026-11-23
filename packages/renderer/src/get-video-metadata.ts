import { open } from "node:fs/promises";
import { MotioError } from "./errors.js";
import { type FfmpegExecutableOptions, resolveMediaBinaries } from "./ffmpeg-resolve.js";
import {
	audioStream,
	checkLogLevel,
	fileDuration,
	localMediaFile,
	type ProbedFile,
	type ProbedStream,
	probeFile,
	videoStream,
} from "./media-file.js";
import type { LogLevel } from "./options.js";

/** Video codec reported by `getVideoMetadata()`; `unknown` for any other codec. */
export type VideoMetadataCodec = "h264" | "h265" | "vp8" | "vp9" | "av1" | "prores" | "unknown";

/** Matrix coefficients of the video, from the file's tags. */
export type VideoMetadataColorSpace =
	| "rgb"
	| "bt601"
	| "bt709"
	| "bt2020-ncl"
	| "bt2020-cl"
	| "fcc"
	| "bt470bg"
	| "smpte170m"
	| "smpte240m"
	| "ycgco"
	| "smpte2085"
	| "chroma-derived-ncl"
	| "chroma-derived-cl"
	| "ictcp"
	| "unknown";

/** Audio codecs `getVideoMetadata()` names; any other audio codec is `unknown`. */
export const VIDEO_METADATA_AUDIO_CODECS = [
	"opus",
	"aac",
	"mp3",
	"pcm-f16le",
	"pcm-f24le",
	"pcm-f32be",
	"pcm-s16be",
	"pcm-s16le",
	"pcm-f32le",
	"pcm-s32be",
	"pcm-s32le",
	"pcm-s64be",
	"pcm-s64le",
	"pcm-u16be",
	"pcm-u16le",
	"pcm-u24be",
	"pcm-u24le",
	"pcm-u32be",
	"pcm-u32le",
	"pcm-u8",
	"pcm-f64be",
	"pcm-s24be",
	"pcm-s24le",
	"pcm-s8",
	"pcm-s16be-planar",
	"pcm-s8-planar",
	"pcm-s24le-planar",
	"pcm-s32le-planar",
	"unknown",
] as const;
/** Audio codec reported by `getVideoMetadata()`. */
export type VideoMetadataAudioCodec = (typeof VIDEO_METADATA_AUDIO_CODECS)[number];

/** Result of `getVideoMetadata()`. */
export interface VideoMetadata {
	/** Frames per second, rounded to 5 decimals (29.97003 for 30000/1001). */
	fps: number;
	/** Stored width in pixels, before any display rotation. */
	width: number;
	/** Stored height in pixels, before any display rotation. */
	height: number;
	/** Length of the file in seconds, as its container states it. */
	durationInSeconds: number;
	codec: VideoMetadataCodec;
	/** Whether browsers can play the video codec in a `<video>` tag (false for ProRes). */
	canPlayInVideoTag: boolean;
	/**
	 * A prediction of whether the video seeks well in a browser: false for codecs a browser does
	 * not play; true below 5 seconds or for codecs other than H.264; for longer H.264, true only
	 * in an MP4 or MOV file whose `moov` atom comes before `mdat` ("faststart").
	 */
	supportsSeeking: boolean;
	/** Matrix coefficients; an untagged video is `bt601`. */
	colorSpace: VideoMetadataColorSpace;
	/** Codec of the first audio stream; null when the file has no audio. */
	audioCodec: VideoMetadataAudioCodec | null;
	/**
	 * File extension (no dot) that holds the audio stream as is, for `extractAudio()`; null without
	 * audio or for an `unknown` audio codec.
	 */
	audioFileExtension: string | null;
	/** FFmpeg pixel format name (`yuv420p`, `yuv420p10le`, ...); `unknown` if not reported. */
	pixelFormat: string;
	/**
	 * Motio extension: clockwise rotation in degrees (0, 90, 180 or 270) a player applies to show
	 * the video upright, from the file's display matrix. `width` and `height` are the stored size;
	 * for 90 and 270 the displayed size swaps them.
	 */
	rotation: number;
}

/** Options of `getVideoMetadata()`. */
export interface GetVideoMetadataOptions extends FfmpegExecutableOptions {
	/** Accepted for compatibility; the function logs nothing of its own. */
	logLevel?: LogLevel;
	/** Directory holding `ffmpeg` and `ffprobe`; default: the renderer's FFmpeg resolution. */
	binariesDirectory?: string | null;
}

const VIDEO_CODECS: Record<string, VideoMetadataCodec> = {
	h264: "h264",
	hevc: "h265",
	vp8: "vp8",
	vp9: "vp9",
	av1: "av1",
	prores: "prores",
};

/** FFmpeg's `color_space` names that differ from the documented ones. */
const COLOR_SPACES: Record<string, VideoMetadataColorSpace> = {
	gbr: "rgb",
	bt2020nc: "bt2020-ncl",
	bt2020c: "bt2020-cl",
	"chroma-derived-nc": "chroma-derived-ncl",
	"chroma-derived-c": "chroma-derived-cl",
};
const NAMED_COLOR_SPACES = new Set<string>([
	"rgb",
	"bt709",
	"fcc",
	"bt470bg",
	"smpte170m",
	"smpte240m",
	"ycgco",
	"smpte2085",
	"ictcp",
]);

/** Videos at least this long need faststart to seek well when they are H.264. */
const SEEKING_MIN_DURATION = 5;

/**
 * Reads a video file's metadata with ffprobe: frame rate, size, duration, codecs, colour space,
 * pixel format, display rotation and whether it seeks well in a browser.
 */
export async function getVideoMetadata(
	videoSource: string,
	options: GetVideoMetadataOptions = {},
): Promise<VideoMetadata> {
	checkLogLevel(options.logLevel);
	const path = await localMediaFile(videoSource, "videoSource");
	const { ffprobe } = await resolveMediaBinaries(options);
	const file = await probeFile(ffprobe, path);
	const video = videoStream(file);
	if (!video) {
		throw new MotioError(
			"E_NO_VIDEO_STREAM",
			`${path} has no video stream. getVideoMetadata() reads video files; for audio-only files use getSilentParts() or ffprobe.`,
			{ details: { path } },
		);
	}
	const codec = VIDEO_CODECS[video.codec_name ?? ""] ?? "unknown";
	const durationInSeconds = fileDuration(file);
	const canPlayInVideoTag = codec !== "unknown" && codec !== "prores";
	const audio = audioStream(file);
	const audioCodec = audio ? toAudioCodec(audio.codec_name) : null;
	return {
		fps: frameRate(video),
		width: video.width ?? 0,
		height: video.height ?? 0,
		durationInSeconds,
		codec,
		canPlayInVideoTag,
		supportsSeeking:
			canPlayInVideoTag &&
			(durationInSeconds < SEEKING_MIN_DURATION ||
				codec !== "h264" ||
				(await hasFaststart(path, file))),
		colorSpace: toColorSpace(video.color_space),
		audioCodec,
		audioFileExtension: audioCodec === null ? null : audioFileExtension(audioCodec),
		pixelFormat: video.pix_fmt && video.pix_fmt !== "none" ? video.pix_fmt : "unknown",
		rotation: rotation(video),
	};
}

/** `num/den` as a number, or null for 0/0 and malformed values. */
function ratio(value: string | undefined): number | null {
	const m = /^(\d+)\/(\d+)$/.exec(value ?? "");
	if (!m) return null;
	const den = Number(m[2]);
	return den > 0 && Number(m[1]) > 0 ? Number(m[1]) / den : null;
}

function frameRate(video: ProbedStream): number {
	const fps = ratio(video.avg_frame_rate) ?? ratio(video.r_frame_rate) ?? 0;
	return Math.round(fps * 1e5) / 1e5;
}

function toColorSpace(name: string | undefined): VideoMetadataColorSpace {
	if (name === undefined || name === "unknown" || name === "unspecified") return "bt601";
	if (NAMED_COLOR_SPACES.has(name)) return name as VideoMetadataColorSpace;
	return COLOR_SPACES[name] ?? "unknown";
}

/** FFmpeg's `pcm_s16le` becomes `pcm-s16le`; codecs outside the documented list are `unknown`. */
export function toAudioCodec(name: string | undefined): VideoMetadataAudioCodec {
	const candidate = (name ?? "").replaceAll("_", "-");
	return (VIDEO_METADATA_AUDIO_CODECS as readonly string[]).includes(candidate)
		? (candidate as VideoMetadataAudioCodec)
		: "unknown";
}

/** The extension of a file that holds this audio codec without re-encoding, or null. */
export function audioFileExtension(codec: VideoMetadataAudioCodec): string | null {
	if (codec === "unknown") return null;
	if (codec.startsWith("pcm-")) return "wav";
	return codec;
}

/** Clockwise display rotation, normalised to 0, 90, 180 or 270. */
function rotation(video: ProbedStream): number {
	// ffprobe reports the display matrix as a counter-clockwise angle; the legacy `rotate` tag is
	// clockwise.
	const matrix = video.side_data_list?.find((d) => typeof d.rotation === "number")?.rotation;
	const clockwise =
		matrix !== undefined ? -matrix : video.tags?.rotate ? Number(video.tags.rotate) : 0;
	if (!Number.isFinite(clockwise)) return 0;
	const quarter = Math.round(clockwise / 90) * 90;
	return ((quarter % 360) + 360) % 360;
}

/**
 * True when an MP4 or MOV file has its `moov` atom before the first `mdat`, which lets a browser
 * start playing and seek before it has loaded the whole file. Other containers return false.
 */
async function hasFaststart(path: string, file: ProbedFile): Promise<boolean> {
	if (!/(^|,)(mov|mp4)(,|$)/.test(file.format.format_name ?? "")) return false;
	const handle = await open(path, "r");
	try {
		const { size } = await handle.stat();
		const header = Buffer.alloc(16);
		let offset = 0;
		while (offset + 8 <= size) {
			const { bytesRead } = await handle.read(header, 0, 16, offset);
			if (bytesRead < 8) return false;
			const type = header.toString("latin1", 4, 8);
			if (type === "moov") return true;
			if (type === "mdat") return false;
			let boxSize = header.readUInt32BE(0);
			if (boxSize === 1) {
				if (bytesRead < 16) return false;
				boxSize = Number(header.readBigUInt64BE(8));
			} else if (boxSize === 0) {
				return false;
			}
			if (boxSize < 8) return false;
			offset += boxSize;
		}
		return false;
	} finally {
		await handle.close();
	}
}
