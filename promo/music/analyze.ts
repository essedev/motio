// Objective listening check of promo/music/teaser.wav: loudness and peak (FFmpeg ebur128), per
// section loudness and spectrum balance, DC offset, clipping, clicks at section boundaries, the
// scene accents against their frames, and a waveform and a spectrogram PNG next to the file.
// Run: node promo/music/analyze.ts (after generate.ts).

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const WAV = join(DIR, "teaser.wav");
const FPS = 30;

// Section boundaries (seconds) and cut accents (frames), as generate.ts prints them.
const CUTS = [
	{ id: "pitch", frame: 46.09 },
	{ id: "code", frame: 105.09 },
	{ id: "reasons", frame: 239.09 },
	{ id: "speed", frame: 358.09 },
	{ id: "install", frame: 447.09 },
	{ id: "end", frame: 506.09 },
];

const buf = readFileSync(WAV);
const sr = buf.readUInt32LE(24);
const channels = buf.readUInt16LE(22);
const bits = buf.readUInt16LE(34);
let off = 12;
while (buf.toString("ascii", off, off + 4) !== "data") off += 8 + buf.readUInt32LE(off + 4);
const n = buf.readUInt32LE(off + 4) / 4;
const L = new Float64Array(n);
const R = new Float64Array(n);
let clipped = 0;
for (let i = 0; i < n; i++) {
	const l = buf.readInt16LE(off + 8 + i * 4);
	const r = buf.readInt16LE(off + 10 + i * 4);
	if (Math.abs(l) >= 32767 || Math.abs(r) >= 32767) clipped++;
	L[i] = l / 32768;
	R[i] = r / 32768;
}
const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
console.log(
	`format ${sr} Hz, ${channels} ch, ${bits}-bit, ${n} samples = ${(n / sr).toFixed(3)} s = ${((n / sr) * FPS).toFixed(2)} frames`,
);

// FFmpeg prints its reports on stderr; return both streams.
const ffmpeg = (args: string[]): string => {
	const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...args], { encoding: "utf8" });
	if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
	return `${r.stdout}${r.stderr}`;
};
// Runs an audio filter over the file, or over [from, to] seconds of it, and returns the report.
const runCapture = (filter: string, from?: number, to?: number): string => {
	const trim = from === undefined ? "" : `atrim=${from}:${to},asetpts=N/SR/TB,`;
	return ffmpeg(["-i", WAV, "-af", `${trim}${filter}`, "-f", "null", "-"]);
};

// Whole file.
const whole = runCapture("ebur128=peak=true:framelog=quiet");
const I = /I:\s+(-?[\d.]+) LUFS/.exec(whole)?.[1];
const LRA = /LRA:\s+(-?[\d.]+) LU/.exec(whole)?.[1];
const TP = /Peak:\s+(-?[\d.]+) dBFS/.exec(whole)?.[1];
console.log(`ebur128: integrated ${I} LUFS, LRA ${LRA} LU, true peak ${TP} dBTP`);
const stats = runCapture(
	"astats=measure_overall=DC_offset+Peak_level+Flat_factor:measure_perchannel=none",
);
console.log(
	`astats: DC offset ${/DC offset: (\S+)/.exec(stats)?.[1]}, peak ${/Peak level dB: (\S+)/.exec(stats)?.[1]} dBFS, full-scale samples ${clipped}`,
);

// Sections: loudness (momentary max, via ebur128 on the trimmed range) and spectrum balance.
const bounds = [0, ...CUTS.map((c) => c.frame / FPS), n / sr];
const names = ["intro", ...CUTS.map((c) => c.id)];

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
const bandEnergy = (from: number, to: number) => {
	const size = 4096;
	const acc = new Float64Array(BANDS.length);
	const s0 = Math.round(from * sr);
	const s1 = Math.round(to * sr);
	for (let s = s0; s + size <= s1; s += size / 2) {
		const re = new Float64Array(size);
		const im = new Float64Array(size);
		for (let i = 0; i < size; i++) {
			const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
			re[i] = (((L[s + i] as number) + (R[s + i] as number)) / 2) * w;
		}
		fft(re, im);
		for (let k = 1; k < size / 2; k++) {
			const f = (k * sr) / size;
			const p = (re[k] as number) ** 2 + (im[k] as number) ** 2;
			const bi = BANDS.findIndex(([, lo, hi]) => f >= lo && f < hi);
			if (bi >= 0) acc[bi] = (acc[bi] as number) + p;
		}
	}
	const total = acc.reduce((a, b) => a + b, 0);
	return [...acc].map((e) => (10 * Math.log10(e / total)).toFixed(1));
};

console.log(
	`\nsection    from-to (s)      LUFS(I)  peak dBFS  band share dB [${BANDS.map((b) => b[0]).join(" | ")}]`,
);
for (let k = 0; k < names.length; k++) {
	const a = bounds[k] as number;
	const b = bounds[k + 1] as number;
	const out = runCapture("ebur128=peak=sample:framelog=quiet", a, b);
	const li = /I:\s+(-?[\d.]+) LUFS/.exec(out)?.[1] ?? "n/a";
	let pk = 0;
	for (let i = Math.round(a * sr); i < Math.round(b * sr); i++)
		pk = Math.max(pk, Math.abs(L[i] as number), Math.abs(R[i] as number));
	console.log(
		`${(names[k] as string).padEnd(10)} ${a.toFixed(2).padStart(5)}-${b.toFixed(2).padEnd(6)}  ${li.padStart(7)}  ${db(pk).toFixed(1).padStart(9)}  ${bandEnergy(a, b).join(" | ")}`,
	);
}

// Clicks: the largest sample-to-sample jump in a 40 ms window around each boundary, against the
// largest jump of the whole file. A click would stand out as a jump far above the local signal.
const jump = (i: number) =>
	Math.max(
		Math.abs((L[i] as number) - (L[i - 1] as number)),
		Math.abs((R[i] as number) - (R[i - 1] as number)),
	);
let maxJump = 0;
for (let i = 1; i < n; i++) maxJump = Math.max(maxJump, jump(i));
// Second difference (curvature) catches steps that the first difference hides in loud passages.
const curv = (i: number) =>
	Math.max(
		Math.abs((L[i + 1] as number) - 2 * (L[i] as number) + (L[i - 1] as number)),
		Math.abs((R[i + 1] as number) - 2 * (R[i] as number) + (R[i - 1] as number)),
	);
const win = Math.round(0.02 * sr);
console.log(`\nclicks: max sample jump in the file ${maxJump.toFixed(4)}`);
for (let k = 1; k < bounds.length; k++) {
	const c = Math.round((bounds[k] as number) * sr);
	let jMax = 0;
	let cMax = 0;
	let rms = 0;
	for (let i = Math.max(1, c - win); i < Math.min(n - 1, c + win); i++) {
		jMax = Math.max(jMax, jump(i));
		cMax = Math.max(cMax, curv(i));
		rms += (L[i] as number) ** 2;
	}
	rms = Math.sqrt(rms / (2 * win));
	console.log(
		`  ${(names[k] ?? "file end").padEnd(8)} ${(bounds[k] as number).toFixed(3)} s: max jump ${jMax.toFixed(4)}, max curvature ${cMax.toFixed(4)}, local rms ${rms.toFixed(4)}`,
	);
}
console.log(
	`  first sample ${(L[0] as number).toFixed(5)}, last sample ${(L[n - 1] as number).toFixed(5)}; last 100 ms peak ${db(Math.max(...Array.from(L.subarray(n - sr / 10)).map(Math.abs))).toFixed(1)} dBFS`,
);

// Accents: onset strength from the rise of a 5 ms energy envelope (low band, where the boom and
// kick live), the strongest onset within 100 ms of each cut, reported in ms and frames.
const hop = Math.round(0.002 * sr);
const frameLen = Math.round(0.005 * sr);
// Two one-pole low-passes at 150 Hz keep only the kick and the boom.
const low = new Float64Array(n);
{
	const a = Math.exp((-2 * Math.PI * 150) / sr);
	let y1 = 0;
	let y2 = 0;
	for (let i = 0; i < n; i++) {
		y1 = (1 - a) * (((L[i] as number) + (R[i] as number)) / 2) + a * y1;
		y2 = (1 - a) * y1 + a * y2;
		low[i] = y2;
	}
}
const env: number[] = [];
for (let s = 0; s + frameLen < n; s += hop) {
	let e = 0;
	for (let i = s; i < s + frameLen; i++) e += (low[i] as number) ** 2;
	env.push(Math.log10(e + 1e-9));
}
const flux = env.map((v, i) => (i === 0 ? 0 : Math.max(0, v - (env[i - 4] ?? v))));
console.log("\naccents (strongest onset within 100 ms of each cut):");
for (const c of CUTS) {
	const t = c.frame / FPS;
	const i0 = Math.round(((t - 0.1) * sr) / hop);
	const i1 = Math.round(((t + 0.1) * sr) / hop);
	let best = i0;
	for (let i = i0; i <= i1; i++) if ((flux[i] ?? 0) > (flux[best] ?? 0)) best = i;
	const tOn = (best * hop + frameLen / 2) / sr;
	console.log(
		`  ${c.id.padEnd(8)} cut frame ${c.frame.toFixed(2)} -> onset at ${tOn.toFixed(3)} s = frame ${(tOn * FPS).toFixed(2)} (${((tOn - t) * 1000).toFixed(0)} ms)`,
	);
}

// Pictures.
ffmpeg([
	"-y",
	"-i",
	WAV,
	"-filter_complex",
	"showwavespic=s=1600x300:split_channels=1:colors=#FF3D8B|#12B5A5",
	"-frames:v",
	"1",
	join(DIR, "teaser-waveform.png"),
]);
ffmpeg([
	"-y",
	"-i",
	WAV,
	"-lavfi",
	"showspectrumpic=s=1600x600:legend=1:scale=log:fscale=log:stop=16000",
	join(DIR, "teaser-spectrogram.png"),
]);
console.log(
	`\nwrote ${join(DIR, "teaser-waveform.png")} and ${join(DIR, "teaser-spectrogram.png")}`,
);
