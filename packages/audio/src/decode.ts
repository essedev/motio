import { spawn } from "node:child_process";
import { AudioError } from "./errors.js";

/** Number of channels of the first audio stream of `src`, read with ffprobe. */
export function probeChannels(ffprobe: string, src: string): Promise<number> {
	return new Promise((resolve, reject) => {
		const args = [
			"-v",
			"error",
			"-select_streams",
			"a:0",
			"-show_entries",
			"stream=channels",
			"-of",
			"csv=p=0",
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
			const n = Number.parseInt(out.trim(), 10);
			if (code !== 0 || !Number.isInteger(n) || n < 1) {
				reject(
					new AudioError("E_AUDIO_DECODE", `${src} has no readable audio stream: ${err.trim()}`, {
						src,
						code,
					}),
				);
				return;
			}
			resolve(n);
		});
	});
}

/**
 * Decodes `src` (a file path or URL FFmpeg can read) through `filter` to interleaved float
 * samples at `sampleRate` with `channels` channels. A mono source is duplicated into every
 * channel at full level: FFmpeg's default upmix treats mono as a centre channel and lowers it
 * by 3 dB, which Remotion does not do.
 */
export function decodeToFloat(options: {
	ffmpeg: string;
	src: string;
	filter: string;
	sampleRate: number;
	channels: number;
	sourceChannels: number;
}): Promise<Float32Array> {
	const { ffmpeg, src, sampleRate, channels, sourceChannels } = options;
	const upmix =
		sourceChannels === 1 && channels > 1
			? `,pan=${channels === 2 ? "stereo" : `${channels}c`}|${Array.from({ length: channels }, (_, c) => `c${c}=c0`).join("|")}`
			: "";
	const filter = options.filter + upmix;
	const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-i", src, "-vn", "-af", filter];
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
