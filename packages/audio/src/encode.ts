import { spawn } from "node:child_process";
import { AudioError } from "./errors.js";
import type { MixedAudio } from "./mix.js";

/** Audio codecs the encoder supports, named as in Remotion's `audioCodec` option. */
export type AudioCodec = "aac" | "mp3" | "opus" | "pcm-16";

const CODEC_ARGS: Record<AudioCodec, string[]> = {
	aac: ["-c:a", "aac"],
	mp3: ["-c:a", "libmp3lame"],
	opus: ["-c:a", "libopus"],
	"pcm-16": ["-c:a", "pcm_s16le"],
};

/** FFmpeg output arguments encoding `codec` at `bitrate` (ignored for PCM). */
export function audioCodecArgs(codec: AudioCodec, bitrate?: string): string[] {
	return [...CODEC_ARGS[codec], ...(bitrate && codec !== "pcm-16" ? ["-b:a", bitrate] : [])];
}

/**
 * The mixed samples as a WAV file of 32-bit floats: lossless, so encoding it later gives the
 * same bitstream as encoding the samples directly.
 */
export function floatWav(audio: MixedAudio): Buffer {
	const s = audio.samples;
	const data = Buffer.from(s.buffer, s.byteOffset, s.byteLength);
	const header = Buffer.alloc(44);
	header.write("RIFF", 0, "ascii");
	header.writeUInt32LE(36 + data.length, 4);
	header.write("WAVE", 8, "ascii");
	header.write("fmt ", 12, "ascii");
	header.writeUInt32LE(16, 16);
	header.writeUInt16LE(3, 20); // WAVE_FORMAT_IEEE_FLOAT
	header.writeUInt16LE(audio.channels, 22);
	header.writeUInt32LE(audio.sampleRate, 24);
	header.writeUInt32LE(audio.sampleRate * audio.channels * 4, 28);
	header.writeUInt16LE(audio.channels * 4, 32);
	header.writeUInt16LE(32, 34);
	header.write("data", 36, "ascii");
	header.writeUInt32LE(data.length, 40);
	return Buffer.concat([header, data]);
}

/**
 * Encodes mixed samples once to `output` (the container follows the file extension). With
 * `video`, that file's video stream is copied into `output` next to the audio: encoding and
 * muxing in one FFmpeg run keeps the encoder delay (AAC priming) compensated in the container.
 */
export function encodeAudio(
	audio: MixedAudio,
	options: { output: string; codec: AudioCodec; bitrate?: string; ffmpeg?: string; video?: string },
): Promise<void> {
	const ffmpeg = options.ffmpeg ?? "ffmpeg";
	const args = ["-hide_banner", "-loglevel", "error", "-y"];
	if (options.video) args.push("-i", options.video);
	args.push("-f", "f32le", "-ar", String(audio.sampleRate), "-ac", String(audio.channels));
	args.push("-i", "-");
	if (options.video) args.push("-map", "0:v", "-map", "1:a", "-c:v", "copy");
	args.push(...audioCodecArgs(options.codec, options.bitrate));
	if (options.video && /\.(mp4|m4v|mov)$/i.test(options.output)) {
		args.push("-movflags", "+faststart");
	}
	args.push(options.output);
	return new Promise((resolve, reject) => {
		const child = spawn(ffmpeg, args, { stdio: ["pipe", "ignore", "pipe"] });
		let stderr = "";
		child.stderr.on("data", (c: Buffer) => {
			stderr += c.toString();
		});
		// FFmpeg exits early when it cannot open the output; the write then fails with EPIPE.
		// FFmpeg's exit code and stderr carry the cause, so the error is reported from "close".
		let stdinError: Error | null = null;
		child.stdin.on("error", (e) => {
			stdinError = e;
		});
		child.on("error", (e) =>
			reject(
				new AudioError("E_AUDIO_ENCODE", `could not start ffmpeg: ${e.message}`, {
					output: options.output,
				}),
			),
		);
		child.on("close", (code) => {
			if (code === 0 && stdinError === null) resolve();
			else
				reject(
					new AudioError(
						"E_AUDIO_ENCODE",
						`ffmpeg failed to encode ${options.output}: ${stderr.trim() || stdinError?.message}`,
						{ output: options.output, code },
					),
				);
		});
		const s = audio.samples;
		child.stdin.end(Buffer.from(s.buffer, s.byteOffset, s.byteLength));
	});
}
