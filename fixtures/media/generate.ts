// Generates the media fixtures deterministically: H.264 source videos where every frame carries
// its own index as a frame stamp, at several frame rates, a click track and a tone. Run: pnpm generate
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { frameStampBlocks } from "../../packages/testing/src/frame-stamp.ts";

const W = 480;
const H = 270;
const STAMP = { x: 48, y: 127, blockSize: 16 } as const;
const pub = join(import.meta.dirname, "public");

function frame(index: number): Buffer {
	const buf = Buffer.alloc(W * H * 3, 0x40);
	for (const b of frameStampBlocks(index, STAMP)) {
		const v = b.on ? 0xff : 0x00;
		for (let y = b.y; y < b.y + b.size; y++)
			buf.fill(v, (y * W + b.x) * 3, (y * W + b.x + b.size) * 3);
	}
	return buf;
}

function video(name: string, rate: string, frames: number) {
	const raw = Buffer.concat(Array.from({ length: frames }, (_, i) => frame(i)));
	const r = spawnSync(
		"ffmpeg",
		[
			"-y",
			"-loglevel",
			"error",
			"-f",
			"rawvideo",
			"-pix_fmt",
			"rgb24",
			"-s",
			`${W}x${H}`,
			"-r",
			rate,
			"-i",
			"-",
			"-c:v",
			"libx264",
			"-preset",
			"medium",
			"-crf",
			"12",
			"-g",
			"12",
			"-bf",
			"2",
			"-pix_fmt",
			"yuv420p",
			"-colorspace",
			"bt709",
			"-color_primaries",
			"bt709",
			"-color_trc",
			"bt709",
			"-color_range",
			"tv",
			"-vf",
			"scale=out_color_matrix=bt709:out_range=tv",
			"-movflags",
			"+faststart",
			"-map_metadata",
			"-1",
			"-fflags",
			"+bitexact",
			"-flags:v",
			"+bitexact",
			join(pub, name),
		],
		{ input: raw },
	);
	if (r.status !== 0) throw new Error(`ffmpeg failed for ${name}: ${r.stderr}`);
}

// 4 seconds of each rate.
video("stamp-24.mp4", "24", 96);
video("stamp-30.mp4", "30", 120);
video("stamp-60.mp4", "60", 240);
video("stamp-5994.mp4", "60000/1001", 240);

/** Writes 48 kHz mono 16-bit PCM samples as a WAV file. */
function wav(name: string, samples: Int16Array) {
	const rate = 48000;
	const header = Buffer.alloc(44);
	header.write("RIFF", 0);
	header.writeUInt32LE(36 + samples.byteLength, 4);
	header.write("WAVEfmt ", 8);
	header.writeUInt32LE(16, 16);
	header.writeUInt16LE(1, 20);
	header.writeUInt16LE(1, 22);
	header.writeUInt32LE(rate, 24);
	header.writeUInt32LE(rate * 2, 28);
	header.writeUInt16LE(2, 32);
	header.writeUInt16LE(16, 34);
	header.write("data", 36);
	header.writeUInt32LE(samples.byteLength, 40);
	writeFileSync(join(pub, name), Buffer.concat([header, Buffer.from(samples.buffer)]));
}

// Click track: 48 kHz mono 16-bit WAV, 4 s, a 1 ms full-scale click every 250 ms starting at 0.
const rate = 48000;
const samples = new Int16Array(rate * 4);
for (let t = 0; t < 16; t++) {
	const start = t * 0.25 * rate;
	for (let i = 0; i < rate / 1000; i++) samples[start + i] = i % 2 === 0 ? 30000 : -30000;
}
wav("clicks.wav", samples);

// Tone: 4 s of a 997 Hz sine at 0.4 of full scale, for seam checks (a gap, a repeated sample or a
// fade at a segment join shows as an error against the exact signal). 997 Hz is prime, so no
// frame boundary falls on the same phase twice.
const tone = new Int16Array(rate * 4);
for (let i = 0; i < tone.length; i++)
	tone[i] = Math.round(0.4 * 32767 * Math.sin((2 * Math.PI * 997 * i) / rate));
wav("tone.wav", tone);
console.log("media fixtures generated");
