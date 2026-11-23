// Writes the animated images of this fixture into public/ and frames.json, from one description:
// eight frames, each filled with one colour of COLORS, with uneven durations. Tests identify the
// frame shown by the colour at the centre of the canvas. Run `node generate.mjs` after editing.
//
// - frames.gif: GIF89a encoded by ../gif/encode.mjs (durations in hundredths of a second).
// - frames.png: APNG by FFmpeg, from one PNG per 10 ms with the repeats dropped (mpdecimate).
// - frames.webp: animated lossless WebP, by img2webp (libwebp) with per-frame durations.
// - frames.avif: animated AVIF by FFmpeg with SVT-AV1, the same way (lossy: colours are within a
//   few levels).
// - short-delays.gif: delays of 0, 1, 2 and 10 hundredths, which decoders treat specially.
//
// Needs FFmpeg 6 or later with libsvtav1, and img2webp.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { encode, image } from "../gif/encode.mjs";

const here = import.meta.dirname;
const SIZE = 64;
export const COLORS = [
	[230, 40, 40],
	[40, 200, 60],
	[40, 80, 230],
	[240, 220, 30],
	[220, 40, 200],
	[40, 210, 220],
	[245, 245, 245],
	[250, 140, 20],
];
/** Duration of each frame in milliseconds (multiples of 10, so GIF holds them exactly). */
export const DURATIONS_MS = [100, 50, 200, 80, 120, 60, 150, 40];

/** A PNG of one solid colour. */
function png([r, g, b]) {
	const crcTable = Array.from({ length: 256 }, (_, n) => {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		return c >>> 0;
	});
	const crc = (bytes) => {
		let c = 0xffffffff;
		for (const byte of bytes) c = (crcTable[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
		return (c ^ 0xffffffff) >>> 0;
	};
	const chunk = (type, data) => {
		const head = Buffer.alloc(8);
		head.writeUInt32BE(data.length, 0);
		head.write(type, 4, "ascii");
		const tail = Buffer.alloc(4);
		tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0);
		return Buffer.concat([head, data, tail]);
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(SIZE, 0);
	ihdr.writeUInt32BE(SIZE, 4);
	ihdr[8] = 8;
	ihdr[9] = 2;
	const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(SIZE).fill([r, g, b]).flat())]);
	const raw = Buffer.concat(Array(SIZE).fill(row));
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr),
		chunk("IDAT", deflateSync(raw)),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

const work = mkdtempSync(join(tmpdir(), "motio-animated-image-"));
try {
	const frames = COLORS.map((color, i) => {
		const file = join(work, `frame-${i}.png`);
		writeFileSync(file, png(color));
		return file;
	});

	writeFileSync(
		join(here, "public/frames.gif"),
		encode({
			width: SIZE,
			height: SIZE,
			colors: COLORS,
			frames: DURATIONS_MS.map((ms, i) => ({
				x: 0,
				y: 0,
				width: SIZE,
				height: SIZE,
				delay: ms / 10,
				disposal: 1,
				indices: image(SIZE, SIZE, () => i),
			})),
		}),
	);
	writeFileSync(
		join(here, "public/short-delays.gif"),
		encode({
			width: SIZE,
			height: SIZE,
			colors: COLORS,
			frames: [0, 1, 2, 10].map((delay, i) => ({
				x: 0,
				y: 0,
				width: SIZE,
				height: SIZE,
				delay,
				disposal: 1,
				indices: image(SIZE, SIZE, () => i),
			})),
		}),
	);

	// One PNG per 10 ms tick at 100 fps, then mpdecimate drops the repeats so each colour is one
	// frame whose duration is its run of ticks (with variable frame timing kept by -fps_mode vfr).
	let tick = 0;
	DURATIONS_MS.forEach((ms, i) => {
		for (let k = 0; k < ms / 10; k++) {
			writeFileSync(join(work, `tick-${String(tick++).padStart(4, "0")}.png`), png(COLORS[i]));
		}
	});
	const ticks = ["-framerate", "100", "-i", join(work, "tick-%04d.png")];
	const dedupe = ["-vf", "mpdecimate=hi=0:lo=0:frac=0:max=0", "-fps_mode", "vfr"];
	// After mpdecimate the last frame lasts one tick; these set its real duration.
	const last = (DURATIONS_MS.at(-1) ?? 0) / 10;
	const ffmpeg = (args) =>
		execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
			stdio: "ignore",
		});
	ffmpeg([
		...ticks,
		...dedupe,
		"-plays",
		"0",
		"-final_delay",
		`${last}/100`,
		"-f",
		"apng",
		join(here, "public/frames.png"),
	]);
	ffmpeg([
		...ticks,
		...dedupe,
		"-c:v",
		"libsvtav1",
		"-svtav1-params",
		"log-level=0",
		"-crf",
		"20",
		"-pix_fmt",
		"yuv420p",
		"-bsf:v",
		`setts=duration='if(eq(N,${COLORS.length - 1}),${last},DURATION)'`,
		"-f",
		"avif",
		"-loop",
		"0",
		join(here, "public/frames.avif"),
	]);
	execFileSync(
		"img2webp",
		[
			"-loop",
			"0",
			"-lossless",
			...frames.flatMap((f, i) => ["-d", String(DURATIONS_MS[i]), f]),
			"-o",
			join(here, "public/frames.webp"),
		],
		{ stdio: "ignore" },
	);
} finally {
	rmSync(work, { recursive: true, force: true });
}

writeFileSync(
	join(here, "frames.json"),
	`${JSON.stringify({ size: SIZE, colors: COLORS, durationsMs: DURATIONS_MS }, null, "\t")}\n`,
);
console.log("animated images written");
