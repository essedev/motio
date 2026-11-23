import { spawn } from "node:child_process";
import { MotioError } from "./errors.js";
import { type FfmpegExecutableOptions, resolveMediaBinaries } from "./ffmpeg-resolve.js";
import {
	audioStream,
	checkLogLevel,
	fileDuration,
	localMediaFile,
	probeFile,
} from "./media-file.js";
import type { LogLevel } from "./options.js";

/** Options of `getSilentParts()`. */
export interface GetSilentPartsOptions extends FfmpegExecutableOptions {
	/** Path of a local video or audio file; its first audio stream is analysed. */
	src: string;
	/** Audio quieter than this, in dB relative to full scale, is silent. Below 30; default -20. */
	noiseThresholdInDecibels?: number;
	/** Shortest stretch of silence reported, in seconds. Above 0; default 1. */
	minDurationInSeconds?: number;
	/** Accepted for compatibility; the function logs nothing of its own. */
	logLevel?: LogLevel;
	/** Directory holding `ffmpeg` and `ffprobe`; default: the renderer's FFmpeg resolution. */
	binariesDirectory?: string | null;
}

/** A stretch of the media, in seconds from its start. */
export interface SilentPart {
	startInSeconds: number;
	endInSeconds: number;
}

/** Result of `getSilentParts()`. */
export interface GetSilentPartsResult {
	/** Silent stretches of at least `minDurationInSeconds`, in order. */
	silentParts: SilentPart[];
	/** The rest of the media, between and around the silent parts, in order. */
	audibleParts: SilentPart[];
	/** Length of the media in seconds, as its container states it. */
	durationInSeconds: number;
}

/**
 * Finds the silent and audible parts of a video or audio file with FFmpeg's `silencedetect`
 * filter. A silence that lasts to the end of the audio ends at `durationInSeconds`.
 */
export async function getSilentParts(
	options: GetSilentPartsOptions,
): Promise<GetSilentPartsResult> {
	checkLogLevel(options.logLevel);
	const threshold = options.noiseThresholdInDecibels ?? -20;
	if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold >= 30) {
		throw new MotioError(
			"E_INVALID_OPTION",
			`noiseThresholdInDecibels must be a number below 30, got ${String(threshold)}`,
		);
	}
	const minDuration = options.minDurationInSeconds ?? 1;
	if (typeof minDuration !== "number" || !Number.isFinite(minDuration) || minDuration <= 0) {
		throw new MotioError(
			"E_INVALID_OPTION",
			`minDurationInSeconds must be a number above 0, got ${String(minDuration)}`,
		);
	}
	const src = await localMediaFile(options.src, "src");
	const { ffmpeg, ffprobe } = await resolveMediaBinaries(options);
	const file = await probeFile(ffprobe, src);
	const stream = audioStream(file);
	if (!stream) {
		throw new MotioError("E_NO_AUDIO_STREAM", `${src} has no audio stream to analyse.`, {
			details: { path: src },
		});
	}
	const detected = await detectSilence(ffmpeg, src, stream.index, threshold, minDuration);
	const durationInSeconds = fileDuration(file) || detected.audioEnd;
	const silentParts = toSilentParts(detected, durationInSeconds);
	return { silentParts, audibleParts: invert(silentParts, durationInSeconds), durationInSeconds };
}

/** What `silencedetect` printed, and where the decoded audio ended. */
export interface DetectedSilence {
	/** `silence_start` and `silence_end` events in order; a last start may have no end. */
	events: { type: "start" | "end"; time: number }[];
	/** End of the decoded audio in seconds (FFmpeg's final `out_time`). */
	audioEnd: number;
}

/**
 * Pairs the events into parts. A silence that reaches the end of the decoded audio (FFmpeg ends
 * it there, or leaves it open) lasts to the end of the file, which can be later than the audio.
 */
export function toSilentParts(detected: DetectedSilence, duration: number): SilentPart[] {
	const parts: SilentPart[] = [];
	let start: number | null = null;
	for (const e of detected.events) {
		if (e.type === "start") start = e.time;
		else if (start !== null) {
			parts.push({ startInSeconds: start, endInSeconds: e.time });
			start = null;
		}
	}
	if (start !== null) parts.push({ startInSeconds: start, endInSeconds: duration });
	const last = parts.at(-1);
	if (last && last.endInSeconds >= detected.audioEnd - 1e-6) last.endInSeconds = duration;
	return parts
		.map((p) => ({
			startInSeconds: Math.max(0, p.startInSeconds),
			endInSeconds: Math.min(duration, p.endInSeconds),
		}))
		.filter((p) => p.endInSeconds > p.startInSeconds);
}

/** The parts of [0, duration] outside the silent parts. */
export function invert(silent: readonly SilentPart[], duration: number): SilentPart[] {
	const audible: SilentPart[] = [];
	let cursor = 0;
	for (const p of silent) {
		if (p.startInSeconds > cursor) {
			audible.push({ startInSeconds: cursor, endInSeconds: p.startInSeconds });
		}
		cursor = Math.max(cursor, p.endInSeconds);
	}
	if (duration > cursor) audible.push({ startInSeconds: cursor, endInSeconds: duration });
	return audible;
}

const EVENT = /silence_(start|end): (-?[\d.]+(?:e[-+]?\d+)?)/;

/** Runs `silencedetect` over one audio stream, decoding it to nothing. */
function detectSilence(
	ffmpeg: string,
	src: string,
	streamIndex: number,
	threshold: number,
	minDuration: number,
): Promise<DetectedSilence> {
	const args = [
		"-hide_banner",
		"-nostats",
		"-v",
		"info",
		"-i",
		src,
		"-map",
		`0:${streamIndex}`,
		"-af",
		// Fixed notation: FFmpeg does not parse exponents in durations.
		`silencedetect=noise=${threshold.toFixed(6)}dB:duration=${minDuration.toFixed(6)}`,
		"-f",
		"null",
		"-progress",
		"pipe:1",
		"-",
	];
	return new Promise((resolve, reject) => {
		const child = spawn(ffmpeg, args, { stdio: ["ignore", "pipe", "pipe"] });
		const events: DetectedSilence["events"] = [];
		let audioEnd = 0;
		let stderrTail = "";
		let pendingErr = "";
		let pendingOut = "";
		child.stderr.setEncoding("utf8");
		child.stdout.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => {
			stderrTail = (stderrTail + chunk).slice(-8_000);
			const lines = (pendingErr + chunk).split("\n");
			pendingErr = lines.pop() ?? "";
			for (const line of lines) {
				const m = EVENT.exec(line);
				if (m) events.push({ type: m[1] as "start" | "end", time: Number(m[2]) });
			}
		});
		child.stdout.on("data", (chunk: string) => {
			const lines = (pendingOut + chunk).split("\n");
			pendingOut = lines.pop() ?? "";
			for (const line of lines) {
				const m = /^out_time_us=(\d+)/.exec(line);
				if (m) audioEnd = Number(m[1]) / 1e6;
			}
		});
		child.on("error", (err) =>
			reject(
				new MotioError(
					(err as NodeJS.ErrnoException).code === "ENOENT"
						? "E_FFMPEG_NOT_FOUND"
						: "E_FFMPEG_FAILED",
					`FFmpeg could not be started at "${ffmpeg}": ${err.message}`,
					{ details: { ffmpeg } },
					err,
				),
			),
		);
		child.on("close", (code) => {
			const last = EVENT.exec(pendingErr);
			if (last) events.push({ type: last[1] as "start" | "end", time: Number(last[2]) });
			if (code === 0) resolve({ events, audioEnd });
			else {
				reject(
					new MotioError(
						"E_FFMPEG_FAILED",
						`FFmpeg could not analyse the audio of ${src} (exit code ${code}): ${stderrTail.trim()}`,
						{ details: { stderr: stderrTail, args: args.join(" ") } },
					),
				);
			}
		});
	});
}
