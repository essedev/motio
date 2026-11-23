import { spawn } from "node:child_process";
import { AudioError } from "./errors.js";

/** Number of channels of audio stream `stream` (default the first) of `src`, read with ffprobe. */
export function probeChannels(ffprobe: string, src: string, stream = 0): Promise<number> {
	return new Promise((resolve, reject) => {
		const args = [
			"-v",
			"error",
			"-select_streams",
			`a:${stream}`,
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
}): Promise<Float32Array> {
	const { ffmpeg, src, sampleRate, channels, filter } = options;
	const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-i", src, "-vn"];
	args.push("-map", `0:a:${options.stream ?? 0}`, "-af", filter);
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
