// Sketch B, "2-step": UK garage at 133.8 BPM with 60% sixteenth swing. A skippy kick that changes
// from bar to bar, rimshot and clap on 2 and 4 sitting a little late, ghost rims and shuffled hats
// with random velocities and timing; a drawbar organ through a rotating-speaker effect playing
// minor-ninth stabs (Fm9, Dbmaj9, Bbm9, C7#9: i, VI, iv, V7); a sine sub bass with glide.
// Accents: the mark (one held organ chord), the speed cut (the dominant bar ends in a beat with
// no kick or sub, then the progression resolves on Fm9), the end card (three beats of swung rim
// fill over a held C7#9, then Fm11 with the rotor slowing down).
// Run: node promo/music/sketches/sketch-b.ts

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	biquad,
	bus,
	duckCurve,
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
	reverb,
	run,
	SR,
	sample,
	writeWav,
} from "./dsp.ts";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "sketch-b.wav");
const rng = makeRng(0x2b57e9);
const g = grid(11); // eleven beats from the speed cut to the end card: 133.8 BPM
const s16 = g.beat / 4;
const SWING = 0.6;
const pos = (bar: number, p: number, sdMs = 0, lateMs = 0) =>
	g.at(bar) +
	p * s16 +
	(p % 2 === 1 ? (SWING - 0.5) * 2 * s16 : 0) +
	(rng.gauss() * sdMs + lateMs) / 1000;
const vel = (base: number, spread = 0.12) => Math.max(0.05, base * (1 + rng.gauss() * spread));

const drums = bus();
const sub = bus();
const organ = bus();
const send = bus();
const kicks: number[] = [];

const kick = (t: number, v = 1) => {
	kicks.push(t);
	const s0 = sample(t);
	const len = Math.round(0.3 * SR);
	let ph = 0;
	for (let i = 0; i < len; i++) {
		const x = i / SR;
		ph += (2 * Math.PI * (60 + 90 * Math.exp(-x / 0.025) + 150 * Math.exp(-x / 0.003))) / SR;
		put(
			drums,
			s0 + i,
			Math.tanh(Math.sin(ph) * 2 * Math.exp(-x / 0.12)) * 0.3 * v * edge(i, len, 6, 2000),
		);
	}
};

// Rimshot: two body modes and a crack of noise. With `clap`, a clap layered on top.
const rim = (t: number, v: number, clap = false, pan = 0) => {
	const s0 = sample(t);
	const len = Math.round(0.25 * SR);
	const bp = biquad("bp", 2100, 0.9);
	const cb = biquad("bp", 1200, 0.8);
	for (let i = 0; i < len; i++) {
		const x = i / SR;
		const body =
			Math.sin(2 * Math.PI * 1720 * x) * Math.exp(-x / 0.018) +
			0.6 * Math.sin(2 * Math.PI * 490 * x) * Math.exp(-x / 0.03);
		const crack = run(bp, rng.noise()) * Math.exp(-x / 0.012);
		let s = (body * 0.35 + crack * 0.6) * v;
		if (clap) {
			let env = 0;
			for (const gp of [0, 0.011, 0.021]) if (x >= gp) env += Math.exp(-(x - gp) / 0.005);
			if (x >= 0.021) env += 0.5 * Math.exp(-(x - 0.021) / 0.09);
			s += run(cb, rng.noise()) * env * 0.45 * v;
		}
		s *= 0.5 * edge(i, len, 6, 400);
		put(drums, s0 + i, s, pan);
		put(send, s0 + i, s * (clap ? 0.35 : 0.1), pan);
	}
};

const hat = (t: number, v: number, open: boolean, pan: number) => {
	const s0 = sample(t);
	const decay = open ? 0.075 : 0.018;
	const len = Math.round((decay * 6 + 0.005) * SR);
	const hp = biquad("hp", 7800, 0.8);
	const lp = biquad("lp", 12000);
	for (let i = 0; i < len; i++) {
		const x = i / SR;
		put(
			drums,
			s0 + i,
			run(lp, run(hp, rng.noise())) * Math.exp(-x / decay) * 0.3 * v * edge(i, len, 8, 200),
			pan,
		);
	}
};

// The rotating speaker: one rotor phase for the whole piece; it slows down after the end card.
const rotor = new Float32Array(N);
{
	let ph = 0;
	for (let n = 0; n < N; n++) {
		const t = n / SR;
		const rate = t < END ? 6.4 : 0.9 + 5.5 * Math.exp(-(t - END) / 0.8);
		ph += (2 * Math.PI * rate) / SR;
		rotor[n] = ph;
	}
}

// Drawbar organ: sub-octave, fundamental, fifth, octave, twelfth and fifteenth, a key click and a
// decaying third-harmonic percussion; vibrato and level move with the rotor, opposite per side.
const BARS: Array<[number, number]> = [
	[0.5, 0.45],
	[1, 1],
	[1.5, 0.3],
	[2, 0.55],
	[3, 0.2],
	[4, 0.12],
];
const organNotes = (t: number, dur: number, notes: number[], v = 1, rel = 0.06) => {
	const s0 = sample(t);
	const len = Math.round((dur + rel) * SR);
	const click = biquad("bp", 2400, 1.5);
	for (const m of notes) {
		const f = mtof(m);
		const ph0 = rng.next() * 2 * Math.PI;
		for (let i = 0; i < len; i++) {
			const x = i / SR;
			const n = s0 + i;
			if (n >= N) break;
			const r = rotor[Math.max(0, n)] as number;
			let s = 0;
			for (const [h, a] of BARS)
				s += Math.sin(2 * Math.PI * f * h * x + ph0 * h + 0.35 * h * Math.sin(r)) * a;
			s += Math.sin(2 * Math.PI * f * 3 * x) * 0.5 * Math.exp(-x / 0.14);
			const env = Math.min(1, x / 0.004) * (x < dur ? 1 : Math.max(0, 1 - (x - dur) / rel));
			s = Math.tanh(s * 0.55) * env * 0.11 * v * edge(i, len, 24, 96);
			const am = 0.22 * Math.sin(r);
			put(organ, n, s * (1 + am), -0.45);
			put(organ, n, s * (1 - am), 0.45);
			put(send, n, s * 0.2);
		}
	}
	for (let i = 0; i < 0.006 * SR; i++)
		put(organ, s0 + i, run(click, rng.noise()) * Math.exp(-i / SR / 0.0015) * 0.08 * v);
};

// Sine sub with a little second harmonic (so phones hear it) and glide from the previous note.
let lastSub = 41;
const subNote = (t: number, dur: number, midi: number, v = 1, decay = 0) => {
	const s0 = sample(t);
	const rel = 0.04;
	const len = Math.round((dur + rel) * SR);
	const from = lastSub;
	lastSub = midi;
	let ph = 0;
	for (let i = 0; i < len; i++) {
		const x = i / SR;
		ph += (2 * Math.PI * mtof(midi + (from - midi) * Math.exp(-x / 0.035))) / SR;
		const env =
			Math.min(1, x / 0.005) *
			(decay > 0 ? Math.exp(-x / decay) : 1) *
			(x < dur ? 1 : Math.max(0, 1 - (x - dur) / rel));
		put(sub, s0 + i, Math.tanh(Math.sin(ph) * 1.6) * 0.42 * env * v * edge(i, len, 48, 96));
	}
};

// Harmony, a chord per bar; the bar of the speed cut (beat -11) is Fm9, the one before it C7#9.
type Chord = { root: number; notes: number[] };
const FM9: Chord = { root: 41, notes: [56, 60, 63, 67] };
const DBMAJ9: Chord = { root: 37, notes: [53, 56, 60, 63] };
const BBM9: Chord = { root: 46, notes: [56, 60, 61, 65] };
const C7S9: Chord = { root: 36, notes: [52, 58, 63, 67] };
const CYCLE = [FM9, DBMAJ9, BBM9, C7S9];
const chordOfBar = (bar: number) => CYCLE[((((bar + 11) / 4) % 4) + 4) % 4] as Chord;

// Kick patterns in sixteenths, alternating; stabs as [position, length in sixteenths].
const KICKS = [
	[0, 10],
	[0, 7, 10],
	[0, 10, 13],
	[0, 7, 10],
];
const STABS: Array<[number, number]> = [
	[3, 1.3],
	[6, 1.6],
	[11, 1.2],
	[14, 1],
];
const SUB: Array<[number, number, number]> = [
	[0, 5, 0],
	[7, 2, 0],
	[10, 3, 0],
	[13, 2, 12],
];

// The mark: a held Fm9 with the sub and one rimshot.
organNotes(MARK, 0.75, FM9.notes, 1.1, 0.35);
subNote(MARK, 0.6, 41, 0.9);
rim(MARK, 0.7);

let barIndex = 0;
for (let bar = -35; bar <= -3; bar += 4) {
	const ch = chordOfBar(bar);
	const full = bar >= -31 && bar < -3;
	const gapFrom = bar === -15 ? 12 : 99; // the beat before the speed cut has no kick or sub
	// Hats: shuffled sixteenths, open on the eighth off-beats.
	if (bar < -3)
		for (let p = 0; p < 16; p++) {
			const open = p === 2 || p === 10;
			const accent = p % 4 === 2 ? 0.9 : p % 2 === 1 ? 0.55 : 0.35;
			if (!full && p % 2 === 0 && !open) continue;
			hat(pos(bar, p, 5), vel(accent * (full ? 1 : 0.7), 0.2), open, p % 2 ? 0.3 : -0.2);
		}
	if (full) {
		for (const p of KICKS[barIndex % 4] as number[])
			if (p < gapFrom) kick(pos(bar, p, 2), vel(p === 0 ? 1 : 0.85, 0.05));
		for (const p of [4, 12]) rim(pos(bar, p, 4, 9), vel(0.95, 0.06), true, 0.05);
		for (const p of [6, 9, 14, 15])
			if (rng.next() < 0.4) rim(pos(bar, p, 6, 4), vel(0.22, 0.3), false, 0.3);
		for (const [p, l, iv] of SUB)
			if (p < gapFrom) subNote(pos(bar, p, 2), l * s16 * 0.95, ch.root + iv, vel(1, 0.05));
	} else if (bar === -35) {
		for (const p of [4, 12]) rim(pos(bar, p, 4, 9), vel(0.5, 0.1), false, 0.05);
	}
	if (bar < -3 && bar > -35)
		for (const [p, l] of STABS) {
			if (p >= gapFrom) continue;
			if (p === 14 && rng.next() < 0.35) continue;
			organNotes(pos(bar, p, 4), l * s16, ch.notes, vel(p === 3 ? 1 : 0.8, 0.12));
		}
	barIndex++;
}
// The speed cut: the resolution lands as a longer stab.
organNotes(g.at(-11), g.beat * 0.9, FM9.notes, 1.15, 0.1);

// The three beats before the end card: a held C7#9 swelling, a swung rim fill getting louder.
organNotes(g.at(-3), g.beat * 2.5, C7S9.notes, 0.55, 0.05);
subNote(g.at(-3), g.beat * 2.4, 36, 0.5);
// The last sixteenth before the end card stays empty.
for (let p = 0; p < 11; p++) {
	if (p < 4 && p % 2 === 0) continue;
	rim(pos(-3, p, 4), vel(0.2 + 0.4 * (p / 10), 0.1), p === 10, p % 2 ? 0.25 : -0.25);
}

// The end card: kick, Fm11 on the organ, the sub; the rotor slows while it rings.
kick(END, 1.1);
organNotes(END, 1.0, [53, 56, 60, 63, 67, 70], 1.15, 1.5);
subNote(END, 2.2, 41, 1, 0.55);
rim(END, 0.8, true);

const room = reverb(send, 0.7, 0.45, 300, 6000);
const pump = duckCurve(
	kicks.filter((k) => k < END - 0.01),
	0.35,
	0.09,
);
const m = mix([
	{ bus: drums, gain: 1.25 },
	{ bus: sub, gain: 0.6, duck: pump, duckAmount: 1 },
	{ bus: organ, gain: 1, duck: pump, duckAmount: 0.6 },
	{ bus: room, gain: 0.7 },
]);
const out = master(m.l, m.r, {
	eq: [
		["lshelf", 90, 0.7, -1.5],
		["peak", 300, 0.9, -1],
		["peak", 2800, 0.8, 1.5],
		["hshelf", 9000, 0.7, -1],
	],
	ratio: 1.6,
	fadeStart: 19.1,
});
const peak = writeWav(OUT, out.l, out.r, rng);
console.log(`wrote ${OUT}`);
console.log(
	`tempo ${g.bpm.toFixed(2)} BPM, swing ${SWING * 100}%; speed cut beat -11 at ${g.at(-11).toFixed(3)} s, end card at ${END.toFixed(3)} s`,
);
console.log(
	`integrated ${out.lufs.toFixed(2)} LUFS (internal meter), sample peak ${peak.toFixed(2)} dBFS`,
);
