// Writes the GIFs of this fixture into public/: deterministic, encoded by this script (GIF89a with
// LZW), so no third-party asset is needed. Run `node generate.mjs` after editing.
//
// - counter.gif: 160x90, global palette, 8 full frames with uneven delays (including 0 and 1
//   hundredths, which decoders treat specially) and a looping NETSCAPE block.
// - sprite.gif: 120x120 over transparency, sub-rectangle frames at offsets with local palettes,
//   every disposal method (none, keep, restore background, restore previous) and an interlaced
//   frame.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { encode, image } from "./encode.mjs";

const here = import.meta.dirname;

// A 3x5 pixel font for the digits drawn on counter.gif.
const DIGITS = [
	"111101101101111",
	"010110010010111",
	"111001111100111",
	"111001111001111",
	"101101111001001",
	"111100111001111",
	"111100111101111",
	"111001010010010",
	"111101111101111",
	"111101111001111",
];

const counterColors = [
	[20, 24, 40],
	[255, 255, 255],
	[230, 57, 70],
	[244, 162, 97],
	[233, 196, 106],
	[42, 157, 143],
	[38, 70, 83],
	[131, 56, 236],
	[58, 134, 255],
];
const counterDelays = [10, 20, 0, 1, 30, 5, 15, 8];
const counter = encode({
	width: 160,
	height: 90,
	colors: counterColors,
	frames: counterDelays.map((delay, n) => ({
		x: 0,
		y: 0,
		width: 160,
		height: 90,
		delay,
		disposal: 1,
		indices: image(160, 90, (x, y) => {
			// A bar that grows with the frame number, and the digit, 10 px per font pixel.
			if (y >= 75 && x < (n + 1) * 20) return 2 + (n % 7);
			const gx = Math.floor((x - 65) / 10);
			const gy = Math.floor((y - 10) / 10);
			if (gx >= 0 && gx < 3 && gy >= 0 && gy < 5 && DIGITS[n][gy * 3 + gx] === "1") return 1;
			return (x + y + n * 4) % 40 < 20 ? 0 : 6;
		}),
	})),
});

// sprite.gif: index 0 of the global palette is transparent everywhere.
const spriteColors = [
	[0, 0, 0],
	[255, 190, 11],
	[251, 86, 7],
	[255, 0, 110],
	[131, 56, 236],
	[58, 134, 255],
	[6, 214, 160],
	[17, 138, 178],
];
const disc = (size, inside, outside) =>
	image(size, size, (x, y) => {
		const c = (size - 1) / 2;
		return (x - c) ** 2 + (y - c) ** 2 <= (size / 2) ** 2 ? inside(x, y) : outside;
	});
const sprite = encode({
	width: 120,
	height: 120,
	colors: spriteColors,
	frames: [
		// 0: full canvas, a ring, kept.
		{
			x: 0,
			y: 0,
			width: 120,
			height: 120,
			delay: 12,
			disposal: 1,
			transparent: 0,
			indices: image(120, 120, (x, y) => {
				const d = Math.hypot(x - 59.5, y - 59.5);
				return d > 44 && d < 54 ? 7 : 0;
			}),
		},
		// 1: a disc at an offset, drawn over the ring, then restored to background (cleared).
		{
			x: 10,
			y: 10,
			width: 40,
			height: 40,
			delay: 9,
			disposal: 2,
			transparent: 0,
			indices: disc(40, (x) => (x < 20 ? 1 : 2), 0),
		},
		// 2: a square with its own palette, restored to the previous canvas afterwards.
		{
			x: 60,
			y: 30,
			width: 50,
			height: 50,
			delay: 7,
			disposal: 3,
			transparent: 3,
			colors: [
				[255, 255, 255],
				[0, 180, 216],
				[144, 224, 239],
				[0, 0, 0],
			],
			indices: image(50, 50, (x, y) => (((x >> 3) + (y >> 3)) % 2 === 0 ? 1 : x > 40 ? 3 : 2)),
		},
		// 3: an interlaced stripe band, no disposal specified.
		{
			x: 0,
			y: 70,
			width: 120,
			height: 37,
			delay: 11,
			disposal: 0,
			transparent: 0,
			interlaced: true,
			indices: image(120, 37, (x, y) => (y % 6 < 3 ? 4 + ((x >> 4) % 3) : 0)),
		},
		// 4: a small disc, kept, where frame 1 was cleared.
		{
			x: 20,
			y: 20,
			width: 24,
			height: 24,
			delay: 25,
			disposal: 1,
			transparent: 0,
			indices: disc(24, () => 6, 0),
		},
	],
});

writeFileSync(join(here, "public/counter.gif"), counter);
writeFileSync(join(here, "public/sprite.gif"), sprite);
