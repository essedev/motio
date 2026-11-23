import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { run } from "@motiojs/video-frames";
import { MotioError } from "./errors.js";
import { type LogLevel, oneOf } from "./options.js";

const LOG_LEVELS: readonly LogLevel[] = ["trace", "verbose", "info", "warn", "error"];

/** Validates `logLevel`; the media functions log nothing of their own, so only the value is checked. */
export function checkLogLevel(logLevel: string | undefined): void {
	oneOf("logLevel", logLevel, LOG_LEVELS, "info");
}

/**
 * The absolute path of a local media file, after checking it exists. Relative paths resolve
 * against the working directory. URLs are refused: these functions read local files, as
 * Remotion's do.
 */
export async function localMediaFile(path: unknown, option: string): Promise<string> {
	if (typeof path !== "string" || path === "") {
		throw new MotioError("E_INVALID_OPTION", `${option} must be the path of a local file`);
	}
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) {
		throw new MotioError(
			"E_INVALID_OPTION",
			`${option} must be a local file, not a URL (${path}). Download the file first.`,
			{ details: { path } },
		);
	}
	const absolute = resolve(path);
	const info = await stat(absolute).catch((err: NodeJS.ErrnoException) => {
		if (err.code === "ENOENT" || err.code === "ENOTDIR") return null;
		throw err;
	});
	if (!info?.isFile()) {
		throw new MotioError(
			"E_MEDIA_SOURCE",
			info ? `${absolute} is not a file` : `${absolute} does not exist`,
			{ details: { path: absolute } },
		);
	}
	return absolute;
}

/** One stream as ffprobe describes it, with the fields the media functions read. */
export interface ProbedStream {
	index: number;
	codec_type?: string;
	codec_name?: string;
	width?: number;
	height?: number;
	pix_fmt?: string;
	color_space?: string;
	avg_frame_rate?: string;
	r_frame_rate?: string;
	duration?: string;
	sample_rate?: string;
	channels?: number;
	disposition?: { attached_pic?: number };
	tags?: Record<string, string>;
	side_data_list?: { side_data_type?: string; rotation?: number }[];
}

/** What ffprobe reports about a file. */
export interface ProbedFile {
	streams: ProbedStream[];
	format: { format_name?: string; duration?: string };
}

/** Runs ffprobe on a local file; a file ffprobe cannot read is `E_MEDIA_SOURCE`. */
export async function probeFile(ffprobe: string, path: string): Promise<ProbedFile> {
	let out: Buffer;
	try {
		out = await run(ffprobe, [
			"-v",
			"error",
			"-show_entries",
			"stream=index,codec_type,codec_name,width,height,pix_fmt,color_space,avg_frame_rate,r_frame_rate,duration,sample_rate,channels:stream_disposition=attached_pic:stream_tags=rotate:stream_side_data=rotation:format=format_name,duration",
			"-of",
			"json",
			path,
		]);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			throw new MotioError(
				"E_FFMPEG_NOT_FOUND",
				`ffprobe was not found at "${ffprobe}". Install FFmpeg, set MOTIO_FFPROBE or pass ffprobeExecutable.`,
				{ details: { ffprobe } },
				err,
			);
		}
		throw new MotioError(
			"E_MEDIA_SOURCE",
			`${path} could not be read as a media file: ${message.trim()}`,
			{ details: { path } },
			err,
		);
	}
	const json = JSON.parse(out.toString()) as Partial<ProbedFile>;
	return { streams: json.streams ?? [], format: json.format ?? {} };
}

/** The first video stream that is not cover art, or undefined. */
export function videoStream(file: ProbedFile): ProbedStream | undefined {
	return file.streams.find((s) => s.codec_type === "video" && s.disposition?.attached_pic !== 1);
}

/** The first audio stream, or undefined. */
export function audioStream(file: ProbedFile): ProbedStream | undefined {
	return file.streams.find((s) => s.codec_type === "audio");
}

/** A positive finite number parsed from an ffprobe field, or null. */
export function positive(value: string | undefined): number | null {
	if (value === undefined) return null;
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? n : null;
}

/** The file's duration: the container's, else the longest stream's; 0 when neither is known. */
export function fileDuration(file: ProbedFile): number {
	const container = positive(file.format.duration);
	if (container !== null) return container;
	return Math.max(0, ...file.streams.map((s) => positive(s.duration) ?? 0));
}
