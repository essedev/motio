// Sketch C, "minimal": sparse and percussive, almost no melody. One note (A) played as a looping
// FM bass motif whose brightness drifts bar by bar; a dry short kick; clicks, rim clicks and
// woodblocks from modal synthesis; tape hiss and crackle; the whole mix through a tape stage (wow,
// flutter, asymmetric saturation, high-frequency loss). Accents: the mark (three woodblocks, one
// per frame of the mark as it lands), the speed cut (a bar without kick, then the kick returns
// with a second voice a fifth up), the end card (a beat and a half of silence, then one hit).
// Run: node promo/music/sketches/sketch-c.ts

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	biquad,
	bus,
	END,
	edge,
	grid,
	MARK,
	makeRng,
	master,
	mix,
	mtof,
	N,
	put,
	run,
	SR,
	sample,
	writeWav,
} from "../dsp.ts";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "sketch-c.wav");
const rng = makeRng(0xc0ffee);
// Beat of the speed cut, counted back from the end card (beat 0): fourteen beats between them
// (121.2 BPM). The bars before it are placed relative to it.
const S = -14;
const g = grid(-S);
const s16 = g.beat / 4;
const SWING = 0.55;
const pos = (bar: number, p: number, sdMs = 0) =>
	g.at(bar) + p * s16 + (p % 2 === 1 ? (SWING - 0.5) * 2 * s16 : 0) + (rng.gauss() * sdMs) / 1000;
const vel = (base: number, spread = 0.15) => Math.max(0.05, base * (1 + rng.gauss() * spread));

const perc = bus();
const bass = bus();
const texture = bus();

const kick = (t: number, v = 1) => {
	const s0 = sample(t);
	const len = Math.round(0.22 * SR);
	let ph = 0;
	for (let i = 0; i < len; i++) {
		const x = i / SR;
		ph += (2 * Math.PI * (60 + 70 * Math.exp(-x / 0.018) + 200 * Math.exp(-x / 0.002))) / SR;
		put(
			perc,
			s0 + i,
			Math.tanh(Math.sin(ph) * 2.4 * Math.exp(-x / 0.07)) * 0.3 * v * edge(i, len, 4, 1200),
		);
	}
};

// Modal percussion: an excitation click into a few decaying sine modes.
const modal = (
	t: number,
	v: number,
	modes: Array<[number, number, number]>,
	pan = 0,
	noiseHz = 3000,
) => {
	const s0 = sample(t);
	const len = Math.round(0.12 * SR);
	const bp = biquad("bp", noiseHz, 1.2);
	for (let i = 0; i < len; i++) {
		const x = i / SR;
		let s = run(bp, rng.noise()) * Math.exp(-x / 0.0012) * 0.5;
		for (const [f, a, d] of modes) s += Math.sin(2 * Math.PI * f * x) * a * Math.exp(-x / d);
		put(perc, s0 + i, s * 0.4 * v * edge(i, len, 4, 400), pan);
	}
};
const woodblock = (t: number, v: number, f: number, pan = 0) =>
	modal(
		t,
		v,
		[
			[f, 1, 0.022],
			[f * 2.74, 0.35, 0.009],
		],
		pan,
		f * 2,
	);
const rimClick = (t: number, v: number, pan = 0) =>
	modal(
		t,
		v,
		[
			[1680, 0.7, 0.012],
			[520, 0.45, 0.02],
		],
		pan,
		3500,
	);
// A click: a short noise burst through a narrow resonance somewhere between 2.5 and 6 kHz.
const click = (t: number, v: number, pan: number) => {
	const s0 = sample(t);
	const len = Math.round(0.02 * SR);
	const bp = biquad("bp", 2500 + rng.next() * 3500, 6);
	for (let i = 0; i < len; i++) {
		const x = i / SR;
		put(
			perc,
			s0 + i,
			run(bp, i < 24 ? rng.noise() : 0) * Math.exp(-x / 0.004) * 1.6 * v * edge(i, len, 2, 100),
			pan,
		);
	}
};

// FM bass: carrier and modulator at the same frequency; the index envelope is the brightness.
const fmBass = (
	t: number,
	dur: number,
	midi: number,
	v: number,
	index: number,
	pan = 0,
	sag = 0,
) => {
	const s0 = sample(t);
	const rel = 0.03;
	const len = Math.round((dur + rel) * SR);
	let pc = rng.next() * 2 * Math.PI;
	let pm = 0;
	for (let i = 0; i < len; i++) {
		const x = i / SR;
		const f = mtof(midi + 3 * Math.exp(-x / 0.008) - sag * Math.min(1, x / 1.5));
		pc += (2 * Math.PI * f) / SR;
		pm += (2 * Math.PI * f) / SR;
		const I = index * Math.exp(-x / 0.07) + 1.1;
		const env =
			Math.min(1, x / 0.002) *
			Math.exp(-x / 0.22) *
			(x < dur ? 1 : Math.max(0, 1 - (x - dur) / rel));
		put(bass, s0 + i, Math.sin(pc + I * Math.sin(pm)) * 0.5 * v * env * edge(i, len, 24, 96), pan);
	}
};

// The motif, one bar in sixteenths: [position, length, velocity].
const MOTIF: Array<[number, number, number]> = [
	[0, 1.5, 1],
	[3, 1, 0.7],
	[6, 1.5, 0.85],
	[10, 1, 0.6],
	[11, 1.5, 0.9],
	[14, 1, 0.7],
];
const A2 = 45;

// The mark: three woodblocks as the three frames land (frames 7, 10 and 13), high to low.
[1180, 940, 760].forEach((f, k) => {
	woodblock(MARK + (k * 3) / 30, k === 0 ? 1 : 0.8, f, (1 - k) * 0.3);
});

const silenceFrom = g.at(-1.5); // the silence before the end card
for (let bar = S - 20; bar <= -2; bar += 4) {
	const lift = bar >= S;
	const noKick = bar === S - 4; // the bar before the speed cut drops the kick
	const drift = 1.6 + 1.4 * Math.sin(((bar - S + 20) / 4) * 0.9); // brightness drifting bar to bar
	for (const [p, l, v] of MOTIF) {
		const t = pos(bar, p, 1.5);
		if (t >= silenceFrom) continue;
		if (noKick && p >= 8) continue; // half a bar of bass, then only clicks into the speed cut
		fmBass(t, l * s16, A2, vel(v, 0.08), (lift ? 2.2 : 1) * drift * (0.8 + 0.4 * rng.next()));
		if (lift && (p === 6 || p === 14)) fmBass(t, l * s16, A2 + 7, vel(0.45, 0.1), 2.5, 0.35);
	}
	for (let b = bar; b < bar + 4; b++) {
		const inBar = b - bar;
		if (g.at(b) >= silenceFrom - 0.001) continue;
		if (b >= S - 16 && !noKick) kick(g.at(b), b === S ? 1.15 : vel(1, 0.04));
		if (b >= S - 12 && inBar === 3) rimClick(pos(b, 0, 4), vel(0.9), 0.1);
		if (b >= S - 12 && inBar === 1 && ((bar - S + 20) / 4) % 2 === 1)
			woodblock(pos(b, 1, 4), vel(0.6), 1060, -0.3);
		// Clicks: sparse at first, every sixteenth with random gaps after the speed cut.
		for (let k = 0; k < 4; k++) {
			const p = inBar * 4 + k;
			const chance = b < S - 8 ? 0.25 : lift ? 0.8 : 0.5;
			const t = pos(bar, p, 3);
			if (t >= silenceFrom) continue;
			if (rng.next() < chance) click(t, vel(k === 2 ? 0.7 : 0.4, 0.3), rng.next() - 0.5);
		}
	}
}

// The end card: one hit after the silence, the note held and sagging like slowing tape.
kick(END, 1.2);
fmBass(END, 1.9, A2, 1.1, 3.5, 0, 0.5);
fmBass(END, 1.9, A2 - 12, 0.5, 1.5, 0, 0.5);
woodblock(END + 0.004, 0.9, 760);
rimClick(END + 0.012, 0.7, 0.2);

// Texture: tape hiss (band-limited noise) and sparse crackle; both dip during the silence.
{
	const [hpL, hpR] = [biquad("hp", 600), biquad("hp", 600)];
	const [lpL, lpR] = [biquad("lp", 7000), biquad("lp", 7000)];
	const crack = biquad("bp", 2200, 0.8);
	for (let n = 0; n < N; n++) {
		const t = n / SR;
		const level = Math.min(1, t / 0.25) * (t >= silenceFrom && t < END ? 0.25 : 1);
		texture.l[n] = run(lpL, run(hpL, rng.noise())) * 0.02 * level;
		texture.r[n] = run(lpR, run(hpR, rng.noise())) * 0.02 * level;
		if (rng.next() < 7 / SR) {
			const a = 0.05 + rng.next() * 0.12;
			const side = rng.next() < 0.5 ? texture.l : texture.r;
			side[n] = (side[n] as number) + run(crack, a) * level;
		} else run(crack, 0);
	}
}

const m = mix([
	{ bus: perc, gain: 1.5 },
	{ bus: bass, gain: 0.75 },
	{ bus: texture, gain: 1 },
]);

// Tape stage: wow and flutter as a modulated delay, asymmetric saturation, high-frequency loss.
{
	let peak = 0;
	for (let n = 0; n < N; n++)
		peak = Math.max(peak, Math.abs(m.l[n] as number), Math.abs(m.r[n] as number));
	const pre = 0.8 / peak;
	for (const ch of [m.l, m.r]) {
		const src = Float32Array.from(ch, (x) => x * pre);
		const lp = biquad("lp", 10500, 0.6);
		const base = 0.004 * SR;
		for (let n = 0; n < N; n++) {
			const t = n / SR;
			const d =
				base +
				0.0003 * SR * Math.sin(2 * Math.PI * 0.55 * t) +
				0.00003 * SR * Math.sin(2 * Math.PI * 6.3 * t);
			const pos0 = n - d;
			const i0 = Math.floor(pos0);
			const fr = pos0 - i0;
			const a = i0 >= 0 ? (src[i0] as number) : 0;
			const b = i0 + 1 >= 0 && i0 + 1 < N ? (src[i0 + 1] as number) : 0;
			const x = a + (b - a) * fr;
			const sat = (Math.tanh(1.5 * x + 0.12) - Math.tanh(0.12)) / 1.5;
			ch[n] = run(lp, sat);
		}
	}
}

const out = master(m.l, m.r, {
	eq: [
		["lshelf", 100, 0.7, -2],
		["peak", 2800, 0.8, 2.5],
	],
	ratio: 1.5,
	fadeStart: N / SR - 0.6,
});
const peak = writeWav(OUT, out.l, out.r, rng);
console.log(`wrote ${OUT}`);
console.log(
	`tempo ${g.bpm.toFixed(2)} BPM, swing ${Math.round(SWING * 100)}%; silence from ${silenceFrom.toFixed(3)} s to the end card at ${END.toFixed(3)} s`,
);
console.log(
	`integrated ${out.lufs.toFixed(2)} LUFS (internal meter), sample peak ${peak.toFixed(2)} dBFS`,
);
