// Generates the media-utils fixtures deterministically. WAV signals are computed here sample by
// sample (no encoder involved); the compressed audio, the video with an audio track and the images
// are encoded with the system FFmpeg from those signals or from lavfi sources, with bitexact flags.
// Run: node fixtures/media-utils/generate.ts
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const pub = join(import.meta.dirname, "public");
mkdirSync(pub, { recursive: true });

/** Writes a 16-bit PCM WAV with interleaved channels from per-channel float signals in -1..1. */
function wav(name: string, rate: number, channels: Float64Array[]): void {
	const frames = channels[0]?.length ?? 0;
	const data = Buffer.alloc(frames * channels.length * 2);
	for (let i = 0; i < frames; i++) {
		for (let c = 0; c < channels.length; c++) {
			const v = Math.max(-1, Math.min(1, channels[c]?.[i] ?? 0));
			data.writeInt16LE(Math.round(v * 32767), (i * channels.length + c) * 2);
		}
	}
	const header = Buffer.alloc(44);
	header.write("RIFF", 0);
	header.writeUInt32LE(36 + data.byteLength, 4);
	header.write("WAVEfmt ", 8);
	header.writeUInt32LE(16, 16);
	header.writeUInt16LE(1, 20);
	header.writeUInt16LE(channels.length, 22);
	header.writeUInt32LE(rate, 24);
	header.writeUInt32LE(rate * channels.length * 2, 28);
	header.writeUInt16LE(channels.length * 2, 32);
	header.writeUInt16LE(16, 34);
	header.write("data", 36);
	header.writeUInt32LE(data.byteLength, 40);
	writeFileSync(join(pub, name), Buffer.concat([header, data]));
}

function signal(rate: number, seconds: number, fn: (t: number, i: number) => number): Float64Array {
	const out = new Float64Array(Math.round(rate * seconds));
	for (let i = 0; i < out.length; i++) out[i] = fn(i / rate, i);
	return out;
}

// Logarithmic sine sweep from 40 Hz to 16 kHz over 2 s, mono, 44.1 kHz (resampled to 48 kHz by
// getAudioData's default sample rate).
const sweepRate = 44100;
const f0 = 40;
const f1 = 16000;
const sweepSeconds = 2;
const k = Math.log(f1 / f0);
wav("sweep.wav", sweepRate, [
	signal(
		sweepRate,
		sweepSeconds,
		(t) =>
			0.8 *
			Math.sin(((2 * Math.PI * f0 * sweepSeconds) / k) * (Math.exp((t / sweepSeconds) * k) - 1)),
	),
]);

// White noise at 0.5 peak, 1.5 s, 48 kHz, from a fixed linear congruential generator.
let seed = 42;
const next = () => {
	seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
	return seed / 4294967296;
};
wav("noise.wav", 48000, [signal(48000, 1.5, () => (next() * 2 - 1) * 0.5)]);

// Stereo at 22.05 kHz with different content per channel: 440 Hz at 0.6 left, 1250 Hz at 0.3 right
// with a 2 Hz amplitude modulation.
wav("stereo.wav", 22050, [
	signal(22050, 1.5, (t) => 0.6 * Math.sin(2 * Math.PI * 440 * t)),
	signal(
		22050,
		1.5,
		(t) => 0.3 * Math.sin(2 * Math.PI * 1250 * t) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 2 * t)),
	),
]);

// One second of digital silence.
wav("silent.wav", 48000, [new Float64Array(48000)]);

// A 3 s mono tone with a 1 s period envelope, 48 kHz: the source of the compressed variants.
const toneSamples = signal(
	48000,
	3,
	(t) => 0.7 * Math.sin(2 * Math.PI * 660 * t) * (0.25 + 0.75 * Math.abs(Math.sin(Math.PI * t))),
);
wav("tone.wav", 48000, [toneSamples]);

function ffmpeg(args: string[]): void {
	const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { encoding: "utf8" });
	if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ")}\n${r.stderr}`);
}

const bitexact = ["-map_metadata", "-1", "-fflags", "+bitexact", "-flags", "+bitexact"];

// MP3 of the tone (decoded by the browser's own decoder in getAudioData).
ffmpeg([
	"-i",
	join(pub, "tone.wav"),
	"-c:a",
	"libmp3lame",
	"-b:a",
	"128k",
	...bitexact,
	join(pub, "tone.mp3"),
]);

// A 2 s, 30 fps, 160x90 H.264 video with an AAC audio track (the tone), for getVideoMetadata and
// for getAudioData on a video file. The video without audio is fixtures/media/public/stamp-30.mp4.
ffmpeg([
	"-f",
	"lavfi",
	"-i",
	"testsrc2=size=160x90:rate=30:duration=2",
	"-i",
	join(pub, "tone.wav"),
	"-t",
	"2",
	"-c:v",
	"libx264",
	"-preset",
	"medium",
	"-crf",
	"30",
	"-pix_fmt",
	"yuv420p",
	"-c:a",
	"aac",
	"-b:a",
	"96k",
	"-movflags",
	"+faststart",
	...bitexact,
	join(pub, "video-audio.mp4"),
]);

// Images for getImageDimensions.
ffmpeg([
	"-f",
	"lavfi",
	"-i",
	"color=c=0x3366cc:size=123x45",
	"-frames:v",
	"1",
	...bitexact,
	join(pub, "image.png"),
]);
ffmpeg([
	"-f",
	"lavfi",
	"-i",
	"testsrc2=size=320x241",
	"-frames:v",
	"1",
	"-q:v",
	"5",
	...bitexact,
	join(pub, "image.jpg"),
]);
writeFileSync(
	join(pub, "image.svg"),
	'<svg xmlns="http://www.w3.org/2000/svg" width="77" height="33"><title>fixture</title><rect width="77" height="33" fill="#c63"/></svg>\n',
);
console.log("media-utils fixtures generated");
