// Generates the media files the Node API functions (getVideoMetadata, extractAudio, getSilentParts)
// are tested on, from FFmpeg's lavfi sources, into media/. The files are committed: oracle
// recordings and tests read the same bytes. Run: node generate.ts
//
// The audio of gaps.* alternates a loud 440 Hz tone (0.5 of full scale, about -6 dBFS), digital
// silence and a quiet tone (0.05, about -26 dBFS):
//
//   0.0-0.7 silence, 0.7-1.7 loud, 1.7-3.2 silence, 3.2-4.2 quiet, 4.2-4.8 silence,
//   4.8-5.2 loud, 5.2-6.5 silence
//
// so the default threshold (-20 dB) treats the quiet tone as silence and -30 dB does not, and the
// default minimum duration (1 s) keeps only some of the gaps.
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const out = join(import.meta.dirname, "media");
mkdirSync(out, { recursive: true });

const GAPS =
	"0.5*sin(2*PI*440*t)*(between(t,0.7,1.7)+between(t,4.8,5.2))+0.05*sin(2*PI*440*t)*between(t,3.2,4.2)";
const BITEXACT = ["-map_metadata", "-1", "-fflags", "+bitexact", "-flags", "+bitexact"];
const BT709 = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"];

function ffmpeg(name: string, args: string[]) {
	const r = spawnSync(
		"ffmpeg",
		["-y", "-loglevel", "error", ...args, ...BITEXACT, join(out, name)],
		{ encoding: "utf8" },
	);
	if (r.status !== 0) throw new Error(`ffmpeg failed for ${name}: ${r.stderr}`);
}

const video = (size: string, rate: string, seconds: number) => [
	"-f",
	"lavfi",
	"-i",
	`testsrc2=size=${size}:rate=${rate}:duration=${seconds}`,
];
const audio = (expr: string, rate: number, seconds: number) => [
	"-f",
	"lavfi",
	"-i",
	`aevalsrc=exprs='${expr}':s=${rate}:d=${seconds}:c=mono`,
];

// 8 kHz mono 16-bit PCM: exact sample values for silence detection.
ffmpeg("gaps.wav", [...audio(GAPS, 8000, 6.5), "-c:a", "pcm_s16le"]);

// H.264 + AAC, 25 fps, 6.5 s, moov atom at the end (no faststart).
ffmpeg("gaps.mp4", [
	...video("64x36", "25", 6.5),
	...audio(GAPS, 48000, 6.5),
	"-c:v",
	"libx264",
	"-pix_fmt",
	"yuv420p",
	...BT709,
	"-c:a",
	"aac",
	"-b:a",
	"48k",
	"-shortest",
]);

// H.264 without audio, 29.97 fps, 6 s, faststart.
ffmpeg("faststart.mp4", [
	...video("64x36", "30000/1001", 6),
	"-c:v",
	"libx264",
	"-pix_fmt",
	"yuv420p",
	...BT709,
	"-movflags",
	"+faststart",
]);

// H.264 without audio in Matroska, 25 fps, 6 s: seekability outside MP4.
ffmpeg("h264.mkv", [...video("64x36", "25", 6), "-c:v", "libx264", "-pix_fmt", "yuv420p"]);

// VP9 + Opus in WebM, 30 fps, 2 s.
ffmpeg("vp9-opus.webm", [
	...video("64x36", "30", 2),
	...audio("0.3*sin(2*PI*440*t)", 48000, 2),
	"-c:v",
	"libvpx-vp9",
	"-pix_fmt",
	"yuv420p",
	...BT709,
	"-c:a",
	"libopus",
	"-b:a",
	"32k",
	"-shortest",
]);

// H.264 stored 64x36 with a 90 degree display rotation, 24 fps, 2 s, no audio. The rotation is
// added by a remux: given while encoding from lavfi, FFmpeg rotates the pixels instead.
ffmpeg("rotated-source.mp4", [
	...video("64x36", "24", 2),
	"-c:v",
	"libx264",
	"-pix_fmt",
	"yuv420p",
]);
ffmpeg("rotated.mp4", [
	"-display_rotation",
	"90",
	"-i",
	join(out, "rotated-source.mp4"),
	"-c",
	"copy",
]);
rmSync(join(out, "rotated-source.mp4"));

// 10-bit H.265, BT.2020 tags, 25 fps, 2 s, no audio.
ffmpeg("hevc-10bit.mp4", [
	...video("64x36", "25", 2),
	"-c:v",
	"libx265",
	"-x265-params",
	"log-level=error",
	"-pix_fmt",
	"yuv420p10le",
	"-colorspace",
	"bt2020nc",
	"-color_primaries",
	"bt2020",
	"-color_trc",
	"smpte2084",
	"-tag:v",
	"hvc1",
]);

// ProRes 4444 with alpha and 16-bit PCM audio in MOV, 25 fps, 1 s.
ffmpeg("prores.mov", [
	...video("32x18", "25", 1),
	...audio("0.3*sin(2*PI*440*t)", 8000, 1),
	"-c:v",
	"prores_ks",
	"-profile:v",
	"4444",
	"-pix_fmt",
	"yuva444p10le",
	"-qscale:v",
	"31",
	"-c:a",
	"pcm_s16le",
	"-shortest",
]);

// Audio only: MP3, 2 s of a tone with no silence.
ffmpeg("tone.mp3", [
	...audio("0.3*sin(2*PI*440*t)", 44100, 2),
	"-c:a",
	"libmp3lame",
	"-b:a",
	"64k",
]);

// Audio only: 2 s of digital silence.
ffmpeg("silence.wav", [...audio("0", 8000, 2), "-c:a", "pcm_s16le"]);

console.log("node-api media generated");
