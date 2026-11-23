import { extname } from "node:path";
import { MotioError } from "./errors.js";
import { runFfmpeg } from "./ffmpeg.js";
import { type FfmpegExecutableOptions, resolveMediaBinaries } from "./ffmpeg-resolve.js";
import { audioFileExtension, toAudioCodec } from "./get-video-metadata.js";
import { audioStream, checkLogLevel, localMediaFile, probeFile } from "./media-file.js";
import type { LogLevel } from "./options.js";
import { prepareOutput } from "./output.js";

/** Options of `extractAudio()`. */
export interface ExtractAudioOptions extends FfmpegExecutableOptions {
	/** Path of the video (or any media file) whose first audio stream is extracted. */
	videoSource: string;
	/**
	 * Where the audio is written. The stream is copied, not converted, so the extension must name
	 * a container that holds its codec: `getVideoMetadata().audioFileExtension` gives one.
	 */
	audioOutput: string;
	/** Accepted for compatibility; the function logs nothing of its own. */
	logLevel?: LogLevel;
	/** Directory holding `ffmpeg` and `ffprobe`; default: the renderer's FFmpeg resolution. */
	binariesDirectory?: string | null;
}

/**
 * Copies the first audio stream of a file into `audioOutput` without re-encoding it. An existing
 * file at `audioOutput` is replaced; a failed extraction leaves no partial file.
 */
export async function extractAudio(options: ExtractAudioOptions): Promise<void> {
	checkLogLevel(options.logLevel);
	const source = await localMediaFile(options.videoSource, "videoSource");
	if (typeof options.audioOutput !== "string" || options.audioOutput === "") {
		throw new MotioError("E_INVALID_OPTION", "audioOutput must be a file path");
	}
	const extension = extname(options.audioOutput);
	if (extension === "") {
		throw new MotioError(
			"E_INVALID_OPTION",
			`audioOutput needs a file extension, which chooses the container (${options.audioOutput})`,
		);
	}
	const { ffmpeg, ffprobe } = await resolveMediaBinaries(options);
	const stream = audioStream(await probeFile(ffprobe, source));
	if (!stream) {
		throw new MotioError("E_NO_AUDIO_STREAM", `${source} has no audio stream to extract.`, {
			details: { path: source },
		});
	}
	const out = await prepareOutput(options.audioOutput, true, extension);
	try {
		await runFfmpeg(ffmpeg, [
			"-y",
			"-v",
			"error",
			"-i",
			source,
			"-map",
			`0:${stream.index}`,
			"-c",
			"copy",
			out.temp,
		]);
		await out.commit();
	} catch (err) {
		await out.discard();
		if (err instanceof MotioError && err.code === "E_FFMPEG_FAILED") {
			const codec = stream.codec_name ?? "unknown";
			const suggested = audioFileExtension(toAudioCodec(codec)) ?? "mka";
			throw new MotioError(
				"E_FFMPEG_FAILED",
				`Could not write the ${codec} audio of ${source} to ${options.audioOutput}: the audio is copied without conversion, so the extension must name a container that holds ${codec}, such as ".${suggested}". ${err.message}`,
				{ details: { ...err.details, codec, suggestedExtension: suggested } },
				err,
			);
		}
		throw err;
	}
}
