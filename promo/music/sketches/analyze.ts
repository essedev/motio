// Objective check of the sketches: loudness and true peak (FFmpeg ebur128), DC, clipping, per
// section loudness and spectrum balance, how strongly each cut is accented, the onset timing of the
// accented moments, and a spectrogram PNG per sketch.
// Run: node promo/music/sketches/analyze.ts [a] [b] [c]

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CUT_FRAMES, FPS } from "./dsp.ts";

const DIR = dirname(fileURLToPath(import.meta.url));
const which = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["a", "b", "c"];

const ffmpeg = (args: string[]): string => {
	const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...args], { encoding: "utf8" });
	if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
	return `${r.stdout}${r.stderr}`;
};

const fft = (re: Float64Array, im: Float64Array) => {
	const m = re.length;
	for (let i = 1, j = 0; i < m; i++) {
		let bit = m >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			[re[i], re[j]] = [re[j] as number, re[i] as number];
			[im[i], im[j]] = [im[j] as number, im[i] as number];
		}
	}
	for (let len = 2; len <= m; len <<= 1) {
		const ang = (-2 * Math.PI) / len;
		for (let i = 0; i < m; i += len) {
			for (let k = 0; k < len / 2; k++) {
				const wr = Math.cos(ang * k);
				const wi = Math.sin(ang * k);
				const a = i + k;
				const b = a + len / 2;
				const xr = (re[b] as number) * wr - (im[b] as number) * wi;
				const xi = (re[b] as number) * wi + (im[b] as number) * wr;
				re[b] = (re[a] as number) - xr;
				im[b] = (im[a] as number) - xi;
				re[a] = (re[a] as number) + xr;
				im[a] = (im[a] as number) + xi;
			}
		}
	}
};
const BANDS: Array<[string, number, number]> = [
	["<60", 20, 60],
	["60-150", 60, 150],
	["150-500", 150, 500],
	["0.5-2k", 500, 2000],
	["2-6k", 2000, 6000],
	["6-12k", 6000, 12000],
	[">12k", 12000, 24000],
];

for (const id of which) {
	const wav = join(DIR, `sketch-${id}.wav`);
	const buf = readFileSync(wav);
	const sr = buf.readUInt32LE(24);
	const n = buf.readUInt32LE(40) / 4;
	const M = new Float64Array(n);
	let clipped = 0;
	let pk = 0;
	for (let i = 0; i < n; i++) {
		const l = buf.readInt16LE(44 + i * 4);
		const r = buf.readInt16LE(46 + i * 4);
		if (Math.abs(l) >= 32767 || Math.abs(r) >= 32767) clipped++;
		pk = Math.max(pk, Math.abs(l), Math.abs(r));
		M[i] = (l + r) / 65536;
	}
	const whole = ffmpeg(["-i", wav, "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"]);
	const stats = ffmpeg([
		"-i",
		wav,
		"-af",
		"astats=measure_overall=DC_offset:measure_perchannel=none",
		"-f",
		"null",
		"-",
	]);
	console.log(
		`\nsketch ${id.toUpperCase()}: ${(n / sr).toFixed(3)} s = ${((n / sr) * FPS).toFixed(2)} frames`,
	);
	console.log(
		`  integrated ${/I:\s+(-?[\d.]+) LUFS/.exec(whole)?.[1]} LUFS, LRA ${/LRA:\s+(-?[\d.]+) LU/.exec(whole)?.[1]} LU, true peak ${/Peak:\s+(-?[\d.]+) dBFS/.exec(whole)?.[1]} dBTP, sample peak ${(20 * Math.log10(pk / 32768)).toFixed(2)} dBFS, full-scale samples ${clipped}, DC ${/DC offset: (\S+)/.exec(stats)?.[1]}`,
	);

	// Sections between the cuts.
	const bounds = [0, ...CUT_FRAMES.map((f) => f / FPS), n / sr];
	const names = ["intro", "pitch", "code", "reasons", "speed", "install", "end"];
	console.log(`  section   LUFS(I)  band share dB [${BANDS.map((b) => b[0]).join(" | ")}]`);
	for (let k = 0; k < names.length; k++) {
		const a = bounds[k] as number;
		const b = bounds[k + 1] as number;
		const out = ffmpeg([
			"-i",
			wav,
			"-af",
			`atrim=${a}:${b},asetpts=N/SR/TB,ebur128=framelog=quiet`,
			"-f",
			"null",
			"-",
		]);
		const size = 4096;
		const acc = new Float64Array(BANDS.length);
		for (let s = Math.round(a * sr); s + size <= Math.round(b * sr); s += size / 2) {
			const re = new Float64Array(size);
			const im = new Float64Array(size);
			for (let i = 0; i < size; i++)
				re[i] = (M[s + i] as number) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
			fft(re, im);
			for (let q = 1; q < size / 2; q++) {
				const f = (q * sr) / size;
				const bi = BANDS.findIndex(([, lo, hi]) => f >= lo && f < hi);
				if (bi >= 0)
					acc[bi] = (acc[bi] as number) + (re[q] as number) ** 2 + (im[q] as number) ** 2;
			}
		}
		const total = acc.reduce((x, y) => x + y, 0);
		console.log(
			`  ${(names[k] as string).padEnd(8)} ${(/I:\s+(-?[\d.]+) LUFS/.exec(out)?.[1] ?? "n/a").padStart(7)}  ${[...acc].map((e) => (10 * Math.log10(e / total)).toFixed(1)).join(" | ")}`,
		);
	}

	// Accent strength: energy in the 80 ms after a moment against the 220 ms before it (dB), and
	// the strongest onset (5 ms energy rise) within 60 ms of it.
	const energy = (from: number, to: number) => {
		let e = 1e-12;
		for (let i = Math.max(0, Math.round(from * sr)); i < Math.min(n, Math.round(to * sr)); i++)
			e += (M[i] as number) ** 2;
		return e / Math.max(1, (to - from) * sr);
	};
	const moments = [
		{ id: "mark", frame: 7 },
		...["pitch", "code", "reasons", "speed", "install", "end"].map((c, k) => ({
			id: c,
			frame: CUT_FRAMES[k] as number,
		})),
	];
	console.log("  accents: rise in dB (80 ms after vs 220 ms before) and onset offset");
	for (const mo of moments) {
		const t = mo.frame / FPS;
		const rise = 10 * Math.log10(energy(t - 0.005, t + 0.08) / energy(t - 0.25, t - 0.03));
		let best = t - 0.06;
		let bestRise = -Infinity;
		for (let x = t - 0.06; x <= t + 0.06; x += 0.001) {
			const r = energy(x, x + 0.005) / energy(x - 0.02, x - 0.005);
			if (r > bestRise) {
				bestRise = r;
				best = x;
			}
		}
		console.log(
			`    ${mo.id.padEnd(8)} frame ${mo.frame.toFixed(2).padStart(6)}: rise ${rise.toFixed(1).padStart(5)} dB, onset ${((best - t) * 1000).toFixed(0).padStart(4)} ms (${(best * FPS).toFixed(2)} frames)`,
		);
	}
	const png = join(DIR, `sketch-${id}-spectrogram.png`);
	ffmpeg([
		"-y",
		"-loglevel",
		"error",
		"-i",
		wav,
		"-lavfi",
		"showspectrumpic=s=1200x400:legend=1:scale=log:fscale=log:stop=16000",
		png,
	]);
	console.log(`  wrote ${png}`);
}
