import { spawn } from "node:child_process";
import { AudioError } from "./errors.js";

/**
 * Input options for a network source: FFmpeg fails a read that stalls for 30 s
 * (`-rw_timeout`, in microseconds) instead of blocking the render forever.
 */
function networkInputArgs(src: string): string[] {
	return /^[a-z][a-z0-9+.-]*:\/\//i.test(src) && !/^file:/i.test(src)
		? ["-rw_timeout", "30000000"]
		: [];
}

/** What the mixer needs to know about one audio stream of a source. */
export interface SourceProbe {
	/** Channels of the stream. */
	channels: number;
	/** FFmpeg's demuxer names for the container, e.g. `"mov,mp4,m4a,3gp,3g2,mj2"`. */
	formatName: string;
}

/**
 * Containers whose input seeking (`-ss` before `-i`) keeps every sample where a decode from the
 * start puts it, measured with FFmpeg 7 and 8: WAV, AIFF, FLAC, MP3, Ogg and MP4/MOV. Matroska
 * and WebM seeks land 1 ms (48 samples) off, so those, and any container not listed, decode
 * from the start.
 */
const SAMPLE_ACCURATE_SEEK = new Set(["wav", "aiff", "flac", "mp3", "ogg", "mov", "mp4"]);

/** Whether `-ss` before the input keeps the samples of a container where they are. */
export function seeksSampleAccurately(formatName: string): boolean {
	return formatName.split(",").some((name) => SAMPLE_ACCURATE_SEEK.has(name));
}

/**
 * Channels of audio stream `stream` (default the first) of `src` and its container, read with
 * one ffprobe run.
 */
export function probeSource(ffprobe: string, src: string, stream = 0): Promise<SourceProbe> {
	return new Promise((resolve, reject) => {
		const args = [
			...networkInputArgs(src),
			"-v",
			"error",
			"-select_streams",
			`a:${stream}`,
			"-show_entries",
			"stream=channels:format=format_name",
			"-of",
			"json",
			src,
		];
		const child = spawn(ffprobe, args, { stdio: ["ignore", "pipe", "pipe"] });
		let out = "";
		let err = "";
		child.stdout.on("data", (c: Buffer) => {
			out += c.toString();
		});
		child.stderr.on("data", (c: Buffer) => {
			err += c.toString();
		});
		child.on("error", (e) =>
			reject(new AudioError("E_AUDIO_DECODE", `could not start ffprobe: ${e.message}`, { src })),
		);
		child.on("close", (code) => {
			let channels = Number.NaN;
			let formatName = "";
			try {
				const parsed = JSON.parse(out) as {
					streams?: { channels?: number }[];
					format?: { format_name?: string };
				};
				channels = parsed.streams?.[0]?.channels ?? Number.NaN;
				formatName = parsed.format?.format_name ?? "";
			} catch {
				// Reported below with ffprobe's stderr.
			}
			if (code !== 0 || !Number.isInteger(channels) || channels < 1) {
				reject(
					new AudioError("E_AUDIO_DECODE", `${src} has no readable audio stream: ${err.trim()}`, {
						src,
						code,
					}),
				);
				return;
			}
			resolve({ channels, formatName });
		});
	});
}

/**
 * Decodes `src` (a file path or URL FFmpeg can read) through `filter` to interleaved float
 * samples at `sampleRate` with `channels` channels. Channel layouts are converted by FFmpeg's
 * default matrix, so a mono source plays at -3 dB in each stereo channel, which is what
 * Remotion's output measures (D-028).
 */
export function decodeToFloat(options: {
	ffmpeg: string;
	src: string;
	filter: string;
	sampleRate: number;
	channels: number;
	/** Zero-based audio stream. Default 0. */
	stream?: number;
	/** Input seek in seconds (`-ss` before `-i`), for containers that seek sample-accurately. */
	seekSeconds?: number;
	/** Output duration in seconds (`-t`): decoding stops there. Default: to the end. */
	durationSeconds?: number;
}): Promise<Float32Array> {
	const { ffmpeg, src, sampleRate, channels, filter } = options;
	const args = ["-hide_banner", "-loglevel", "error", "-nostdin"];
	if (options.seekSeconds !== undefined && options.seekSeconds > 0) {
		args.push("-ss", String(options.seekSeconds));
	}
	args.push(
		...networkInputArgs(src),
		"-i",
		src,
		"-vn",
		"-map",
		`0:a:${options.stream ?? 0}`,
		"-af",
		filter,
	);
	if (options.durationSeconds !== undefined) args.push("-t", String(options.durationSeconds));
	args.push("-ac", String(channels), "-ar", String(sampleRate), "-f", "f32le", "-");
	return new Promise((resolve, reject) => {
		const child = spawn(ffmpeg, args, { stdio: ["ignore", "pipe", "pipe"] });
		const chunks: Buffer[] = [];
		let stderr = "";
		child.stdout.on("data", (c: Buffer) => chunks.push(c));
		child.stderr.on("data", (c: Buffer) => {
			stderr += c.toString();
		});
		child.on("error", (e) =>
			reject(new AudioError("E_AUDIO_DECODE", `could not start ffmpeg: ${e.message}`, { src })),
		);
		child.on("close", (code) => {
			if (code !== 0) {
				reject(
					new AudioError("E_AUDIO_DECODE", `ffmpeg failed to decode ${src}: ${stderr.trim()}`, {
						src,
						code,
					}),
				);
				return;
			}
			const buf = Buffer.concat(chunks);
			// Copy into an aligned buffer: Buffer.concat may return an unaligned view.
			const out = new Float32Array(buf.length / 4);
			new Uint8Array(out.buffer).set(buf.subarray(0, out.length * 4));
			resolve(out);
		});
	});
}
