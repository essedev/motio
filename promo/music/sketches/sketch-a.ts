// Sketch A, "filter house": a chopped, detuned-saw chord loop in D Dorian (Dm9 to G9, the i-IV
// vamp) through one resonant ladder low-pass that opens over the piece, pumped hard by the kick;
// a rubbery resonant bass with glide; 909-style metallic open hats, claps with loose flams, a
// swung shaker. Accents: the mark (a filter "wah" on one chord), the speed cut (one beat with no
// kick or bass, then the filter snaps wide open), the end card (a two-beat break while the filter
// closes, then one last open chord).
// Run: node promo/music/sketches/sketch-a.ts

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	type Bus,
	biquad,
	blep,
	bus,
	duckCurve,
	END,
	edge,
	grid,
	ladder,
	MARK,
	makeRng,
	master,
	mix,
	mtof,
	N,
	put,
	reverb,
	run,
	SPEED,
	SR,
	sample,
	writeWav,
} from "./dsp.ts";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "sketch-a.wav");
const rng = makeRng(0xa5ee7a);
const g = grid(10); // ten beats from the speed cut to the end card: 121.6 BPM
const s16 = g.beat / 4;
const SWING = 0.54;
/** Time of sixteenth `p` of the bar starting at beat `bar`, swung, plus a human offset (ms sd). */
const pos = (bar: number, p: number, sdMs = 0) =>
	g.at(bar) + p * s16 + (p % 2 === 1 ? (SWING - 0.5) * 2 * s16 : 0) + (rng.gauss() * sdMs) / 1000;
const vel = (base: number, spread = 0.1) => base * (1 + rng.gauss() * spread);

const drums = bus();
const bassBus = bus();
const stabs = bus();
const send = bus();
const kicks: number[] = [];

const kick = (t: number, v = 1) => {
	kicks.push(t);
	const s0 = sample(t);
	const len = Math.round(0.4 * SR);
	let ph = 0;
	for (let i = 0; i < len; i++) {
		const x = i / SR;
		ph += (2 * Math.PI * (57 + 80 * Math.exp(-x / 0.03) + 120 * Math.exp(-x / 0.004))) / SR;
		const s = Math.tanh(Math.sin(ph) * 2.2 * Math.exp(-x / 0.13)) * 0.3 * v;
		put(drums, s0 + i, s * edge(i, len, 6, 3000));
	}
};

const clap = (t: number, v = 1) => {
	const s0 = sample(t);
	const len = Math.round(0.3 * SR);
	const bp = biquad("bp", 1150, 0.8);
	const gaps = [0, 0.009 + rng.next() * 0.004, 0.019 + rng.next() * 0.005];
	for (let i = 0; i < len; i++) {
		const x = i / SR;
		let env = 0;
		for (const gp of gaps) if (x >= gp) env += Math.exp(-(x - gp) / 0.005);
		if (x >= (gaps[2] as number)) env += 0.6 * Math.exp(-(x - (gaps[2] as number)) / 0.08);
		const s = run(bp, rng.noise()) * env * 0.5 * v * edge(i, len, 8, 800);
		put(drums, s0 + i, s, 0.05);
		put(send, s0 + i, s * 0.25);
	}
};

// Six detuned square waves at the classic drum-machine metal ratios, high-passed: a cymbal tone.
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];
const metalHat = (t: number, v: number, decay: number, pan: number) => {
	const s0 = sample(t);
	const len = Math.round(decay * 6 * SR);
	const ph = METAL.map(() => rng.next());
	const hp1 = biquad("hp", 7000, 0.7);
	const hp2 = biquad("hp", 7000, 0.7);
	const lp = biquad("lp", 11000);
	for (let i = 0; i < len; i++) {
		const x = i / SR;
		let s = 0;
		for (const [k, f] of METAL.entries()) {
			const dt = (f * 1.47) / SR;
			let p = (ph[k] as number) + dt;
			if (p >= 1) p -= 1;
			ph[k] = p;
			s += (p < 0.5 ? 1 : -1) + blep(p, dt) - blep((p + 0.5) % 1, dt);
		}
		const env = Math.min(1, x / 0.001) * Math.exp(-x / decay);
		put(
			drums,
			s0 + i,
			run(lp, run(hp2, run(hp1, s * 0.15))) * env * 0.5 * v * edge(i, len, 8, 400),
			pan,
		);
	}
};

const shaker = (t: number, v: number) => {
	const s0 = sample(t);
	const len = Math.round(0.07 * SR);
	const bp = biquad("bp", 7200, 1.2);
	for (let i = 0; i < len; i++) {
		const x = i / SR;
		const env = Math.min(1, x / 0.006) * Math.exp(-x / 0.018);
		put(drums, s0 + i, run(bp, rng.noise()) * env * 0.16 * v * edge(i, len, 8, 200), -0.35);
	}
};

// Chord stabs: five detuned saws per note, dry; the whole loop is filtered later as one bus.
const DETUNE = [-14, -6, 0, 6, 14];
const stab = (t: number, dur: number, notes: number[], v = 1, decay = 0) => {
	const s0 = sample(t);
	const rel = 0.05;
	const len = Math.round((dur + rel) * SR);
	for (const m of notes) {
		const f = mtof(m);
		const vs = DETUNE.map((c, k) => ({
			p: rng.next(),
			dt: (f * 2 ** (c / 1200)) / SR,
			pan: (k - 2) * 0.33,
		}));
		for (let i = 0; i < len; i++) {
			const x = i / SR;
			const env =
				Math.min(1, x / 0.002) *
				(decay > 0 ? Math.exp(-x / decay) : 1) *
				(x < dur ? 1 : Math.max(0, 1 - (x - dur) / rel));
			for (const o of vs) {
				o.p += o.dt;
				if (o.p >= 1) o.p -= 1;
				put(stabs, s0 + i, (2 * o.p - 1 - blep(o.p, o.dt)) * env * 0.028 * v, o.pan);
			}
		}
	}
};

// Rubbery bass: saw and square through a resonant ladder with a snappy envelope, a short pitch
// blip on each attack, and glide from the previous note when legato.
let lastBass = 38;
const bassNote = (t: number, dur: number, midi: number, v = 1, glide = true, decay = 0) => {
	const s0 = sample(t);
	const rel = 0.03;
	const len = Math.round((dur + rel) * SR);
	const lp = ladder();
	const from = glide ? lastBass : midi;
	lastBass = midi;
	let p = rng.next();
	for (let i = 0; i < len; i++) {
		const x = i / SR;
		const m = midi + (from - midi) * Math.exp(-x / 0.028) + 0.6 * Math.exp(-x / 0.012);
		const dt = mtof(m) / SR;
		p += dt;
		if (p >= 1) p -= 1;
		const saw = 2 * p - 1 - blep(p, dt);
		const sq = (p < 0.5 ? 1 : -1) + blep(p, dt) - blep((p + 0.5) % 1, dt);
		const cutoff = 160 + 1700 * v * Math.exp(-x / 0.085);
		const env =
			Math.min(1, x / 0.002) *
			(decay > 0 ? Math.exp(-x / decay) : 1) *
			(x < dur ? 1 : Math.max(0, 1 - (x - dur) / rel));
		put(
			bassBus,
			s0 + i,
			lp((saw * 0.6 + sq * 0.4) * 0.7, cutoff, 2.7) * env * 0.75 * v * edge(i, len, 24, 48),
		);
	}
};

// Harmony: D Dorian, Dm9 and G9 a bar each (bass root D2 = 38, G2 = 43).
const DM9 = [53, 57, 60, 64];
const G9 = [53, 57, 59, 62];
const chordOfBar = (bar: number) => ((bar + 34) / 4) % 2 === 0;
// Loop rhythm in sixteenths: [position, length].
const LOOP: Array<[number, number]> = [
	[0, 2.5],
	[3, 2],
	[6, 3],
	[10, 1.5],
	[12, 3],
];
// Bass in sixteenths: [position, length, interval from the root].
const BASS: Array<[number, number, number]> = [
	[0, 2, 0],
	[3, 1, 12],
	[6, 2, 0],
	[8, 1, 0],
	[10, 1, 7],
	[11, 2, 10],
	[14, 1.5, 12],
];

// The mark: one Dm9 chord, the filter blooms open and closes (the "wah", see the cutoff curve).
stab(MARK, 1.1, DM9, 1.1);
bassNote(MARK, 0.9, 38, 0.8, false);

// Bars every four beats counted back from the speed cut (beat -10); the end card is beat 0.
for (let bar = -34; bar <= -2; bar += 4) {
	const dm = chordOfBar(bar);
	const notes = dm ? DM9 : G9;
	const root = dm ? 38 : 43;
	const beatsInBar = bar === -2 ? 2 : 4;
	for (const [p, l] of LOOP) {
		if (p >= beatsInBar * 4) continue;
		const t = pos(bar, p, 2) + 0.006; // the loop sits a hair behind the beat, like a chopped sample
		if (t < 1.0) continue; // the loop fades in under the end of the mark
		stab(t, l * s16 * 0.9, notes, vel(p === 0 ? 1 : 0.85, 0.06));
	}
	for (let b = bar; b < bar + beatsInBar; b++) {
		const inBar = b - bar;
		const gap = b === -11; // one empty beat before the speed cut
		const groove = b >= -30 && b < -2;
		if (groove && !gap) kick(g.at(b), b === -10 ? 1.1 : 1);
		if (b >= -26 && b < -2) metalHat(pos(b, 2, 3), vel(b >= -10 ? 1 : 0.8), 0.11, 0.25);
		if (b >= -22 && b < -2 && !gap && (inBar === 1 || inBar === 3))
			clap(g.at(b) + (rng.gauss() * 2) / 1000, vel(0.95, 0.06));
		if (b >= -30 && b < -2)
			for (let k = 0; k < 4; k++)
				shaker(pos(b, k, 3), (b < -22 ? 0.6 : 1) * vel(k === 2 ? 0.5 : k % 2 ? 0.8 : 1, 0.15));
	}
	if (bar >= -30 && bar < -2) {
		for (const [p, l, iv] of BASS) {
			const t = pos(bar, p, 1.5);
			if (bar === -14 && t >= g.at(-11) - 0.01) continue; // the gap before speed
			const lift = bar >= -10 && iv === 0 && p === 6 ? 12 : 0; // the bass climbs after speed
			bassNote(t, l * s16 * 0.92, root + iv + lift, vel(p === 0 ? 1 : 0.85, 0.08), p !== 0);
		}
	}
}
// The break before the end card: the bass slides down under the closing filter.
bassNote(g.at(-2), g.beat * 0.9, 33, 0.45, true);

// The end card: kick, the open Dm9 (wider, with the root), the bass, then nothing but the decay.
kick(END, 1.15);
stab(END, 2.5, [50, 53, 57, 60, 64], 1.15, 0.7);
bassNote(END, 2.2, 38, 1, false, 0.5);

// The filter curve of the loop bus, in Hz, against time.
const ramp = (t: number, t0: number, t1: number, a: number, b: number) =>
	a * (b / a) ** Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
const cutoffAt = (t: number): number => {
	if (t < 1.0)
		return (
			380 +
			3400 *
				Math.exp(-Math.max(0, t - MARK) / 0.22) *
				(t >= MARK ? Math.min(1, (t - MARK) / 0.03) : 0)
		);
	if (t < g.at(-11)) return ramp(t, 1.0, g.at(-11), 380, 2000);
	if (t < SPEED) return ramp(t, g.at(-11), SPEED, 2000, 420);
	if (t < g.at(-2)) return 3300 + 3200 * Math.exp(-(t - SPEED) / 0.5);
	if (t < END) return ramp(t, g.at(-2), END, 3300, 330);
	return 300 + 4800 * Math.exp(-(t - END) / 0.45);
};
// The loop sinks back during the break, so the end card lands on near silence.
const levelAt = (t: number) =>
	t >= g.at(-2) && t < END ? 1 - 0.7 * ((t - g.at(-2)) / (END - g.at(-2))) : 1;
const resAt = (t: number) => (t >= g.at(-2) && t < END ? 2.6 : 1.7);

const filtered = (() => {
	const out = bus();
	const fl = ladder();
	const fr = ladder();
	let c = 380;
	const a = 1 - Math.exp(-1 / (0.003 * SR));
	for (let n = 0; n < N; n++) {
		c += (cutoffAt(n / SR) - c) * a;
		const r = resAt(n / SR);
		out.l[n] = fl((stabs.l[n] as number) * 0.9, c, r) * 1.6 * levelAt(n / SR);
		out.r[n] = fr((stabs.r[n] as number) * 0.9, c, r) * 1.6 * levelAt(n / SR);
		put(send, n, ((out.l[n] as number) + (out.r[n] as number)) * 0.06);
	}
	return out;
})();

const room = reverb(send, 0.72, 0.4, 350, 5500);
const pump = duckCurve(
	kicks.filter((k) => k < END - 0.01),
	0.8,
	0.13,
);
const m = mix([
	{ bus: drums, gain: 1 },
	{ bus: bassBus, gain: 0.95, duck: pump, duckAmount: 0.55 },
	{ bus: filtered, gain: 1, duck: pump, duckAmount: 1 },
	{ bus: room as Bus, gain: 0.8, duck: pump, duckAmount: 0.5 },
]);
const out = master(m.l, m.r, {
	eq: [
		["lshelf", 90, 0.7, -2],
		["peak", 250, 0.9, -1.5],
		["peak", 3000, 0.8, 1.5],
		["hshelf", 8000, 0.7, -1.5],
	],
	fadeStart: 19.1,
	ratio: 1.5,
});
const peak = writeWav(OUT, out.l, out.r, rng);
console.log(`wrote ${OUT}`);
console.log(
	`tempo ${g.bpm.toFixed(2)} BPM; speed cut beat -10 at ${g.at(-10).toFixed(3)} s, end card beat 0 at ${END.toFixed(3)} s`,
);
console.log(
	`integrated ${out.lufs.toFixed(2)} LUFS (internal meter), sample peak ${peak.toFixed(2)} dBFS`,
);
