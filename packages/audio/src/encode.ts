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

/** Encodes mixed samples once to `output` (the container follows the file extension). */
export function encodeAudio(
	audio: MixedAudio,
	options: { output: string; codec: AudioCodec; bitrate?: string; ffmpeg?: string },
): Promise<void> {
	const ffmpeg = options.ffmpeg ?? "ffmpeg";
	const args = ["-hide_banner", "-loglevel", "error", "-y", "-f", "f32le"];
	args.push("-ar", String(audio.sampleRate), "-ac", String(audio.channels), "-i", "-");
	args.push(...CODEC_ARGS[options.codec]);
	if (options.bitrate && options.codec !== "pcm-16") args.push("-b:a", options.bitrate);
	args.push(options.output);
	return new Promise((resolve, reject) => {
		const child = spawn(ffmpeg, args, { stdio: ["pipe", "ignore", "pipe"] });
		let stderr = "";
		child.stderr.on("data", (c: Buffer) => {
			stderr += c.toString();
		});
		child.on("error", (e) =>
			reject(
				new AudioError("E_AUDIO_ENCODE", `could not start ffmpeg: ${e.message}`, {
					output: options.output,
				}),
			),
		);
		child.on("close", (code) => {
			if (code === 0) resolve();
			else
				reject(
					new AudioError(
						"E_AUDIO_ENCODE",
						`ffmpeg failed to encode ${options.output}: ${stderr.trim()}`,
						{ output: options.output, code },
					),
				);
		});
		const s = audio.samples;
		child.stdin.end(Buffer.from(s.buffer, s.byteOffset, s.byteLength));
	});
}
