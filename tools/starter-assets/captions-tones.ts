// Writes packages/cli/starters/captions/public/word-tones.mp3: one soft plucked note per word of
// the starter's transcript (public/captions.json), starting when the word starts, so the captions
// play over a sound in step with them without shipping a voice recording. Synthesised here from
// sine waves, so the file has no licence of its own beyond the repository's.
//
// Usage: node tools/starter-assets/captions-tones.ts   (needs ffmpeg with libmp3lame on PATH)
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const STARTER = fileURLToPath(new URL("../../packages/cli/starters/captions/", import.meta.url));
const SAMPLE_RATE = 44_100;
/** Silence after the last word, as the starter's calculateMetadata() adds to the video. */
const TAIL_MS = 500;

interface Word {
	text: string;
	startMs: number;
	endMs: number;
}

const words = JSON.parse(readFileSync(`${STARTER}public/captions.json`, "utf8")) as Word[];

// A melody in C major pentatonic, one note (MIDI number) per word: each sentence of the
// transcript rises and comes back to rest on its last word.
const MELODY = [67, 69, 72, 74, 76, 72, 64, 67, 69, 67, 72, 69, 67, 69, 72, 74, 76, 74, 76, 72];
if (MELODY.length !== words.length) {
	throw new Error(`The melody has ${MELODY.length} notes for ${words.length} words.`);
}

const lastMs = Math.max(...words.map((word) => word.endMs));
const samples = new Float64Array(Math.ceil(((lastMs + TAIL_MS) / 1000) * SAMPLE_RATE));

words.forEach((word, index) => {
	const frequency = 440 * 2 ** (((MELODY[index] as number) - 69) / 12);
	const start = Math.round((word.startMs / 1000) * SAMPLE_RATE);
	// The note rings for the word and a short release after it.
	const length = Math.round(((word.endMs - word.startMs + 250) / 1000) * SAMPLE_RATE);
	for (let i = 0; i < length && start + i < samples.length; i++) {
		const t = i / SAMPLE_RATE;
		const attack = Math.min(1, t / 0.006);
		const decay = Math.exp(-t / 0.22);
		const release = Math.min(1, (length - i) / (0.03 * SAMPLE_RATE));
		const tone =
			Math.sin(2 * Math.PI * frequency * t) +
			0.35 * Math.sin(2 * Math.PI * 2 * frequency * t) * Math.exp(-t / 0.08) +
			0.12 * Math.sin(2 * Math.PI * 3 * frequency * t) * Math.exp(-t / 0.05);
		samples[start + i] = (samples[start + i] ?? 0) + 0.32 * tone * attack * decay * release;
	}
});

// 16-bit PCM WAV, mono.
const pcm = Buffer.alloc(samples.length * 2);
samples.forEach((value, i) => {
	pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32_767), i * 2);
});
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(SAMPLE_RATE, 24);
header.writeUInt32LE(SAMPLE_RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);

const output = `${STARTER}public/word-tones.mp3`;
const ffmpeg = spawn(
	process.env.MOTIO_FFMPEG ?? "ffmpeg",
	["-y", "-v", "error", "-f", "wav", "-i", "pipe:0", "-c:a", "libmp3lame", "-b:a", "96k", output],
	{ stdio: ["pipe", "inherit", "inherit"] },
);
ffmpeg.stdin.end(Buffer.concat([header, pcm]));
ffmpeg.on("close", (code) => {
	if (code !== 0) throw new Error(`ffmpeg exited with ${code}.`);
	console.log(`Wrote ${output}`);
});
