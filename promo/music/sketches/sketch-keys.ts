// The first version of the teaser soundtrack (F major, FM keys, accents on every cut), kept as an
// alternative: promo/music/sketches/sketch-keys.wav, 48 kHz, stereo, 16-bit.
// Everything is generated here from oscillators and seeded noise: no samples, no downloads.
// Run: node promo/music/sketches/sketch-keys.ts (Node 24+ runs TypeScript without a build step).

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 48_000;
const FPS = 30;
const SEED = 0x4d6f7469; // "Moti"
const OUT = join(dirname(fileURLToPath(import.meta.url)), "sketch-keys.wav");

// The timeline, mirrored from promo/src/teaser/Teaser.tsx: keep the two in sync.
const SCENES = [
	{ id: "intro", frames: 60 },
	{ id: "pitch", frames: 75 },
	{ id: "code", frames: 150 },
	{ id: "reasons", frames: 135 },
	{ id: "speed", frames: 105 },
	{ id: "install", frames: 75 },
	{ id: "end", frames: 90 },
] as const;
const TRANSITION_FRAMES = 16;
const TOTAL_FRAMES =
	SCENES.reduce((sum, s) => sum + s.frames, 0) - (SCENES.length - 1) * TRANSITION_FRAMES;
const N = Math.round((TOTAL_FRAMES / FPS) * SR);

// Spring maths, as Motio and Remotion compute it: a damped oscillator from 0 to 1, stretched so
// that it settles (within 0.005) in `durationInFrames`.
const springAt = (t: number, stiffness: number, damping: number, mass = 1): number => {
	const zeta = damping / (2 * Math.sqrt(stiffness * mass));
	const w0 = Math.sqrt(stiffness / mass);
	if (zeta < 1) {
		const wd = w0 * Math.sqrt(1 - zeta * zeta);
		return (
			1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t))
		);
	}
	const s = w0 * Math.sqrt(zeta * zeta - 1);
	const r1 = -zeta * w0 + s;
	const r2 = -zeta * w0 - s;
	const a = r2 / (r1 - r2);
	return 1 + a * Math.exp(r1 * t) + (-1 - a) * Math.exp(r2 * t);
};
const settleFrames = (stiffness: number, damping: number): number => {
	let last = 0;
	for (let f = 0; f < 5000; f++)
		if (Math.abs(1 - springAt(f / FPS, stiffness, damping)) > 0.005) last = f + 1;
	return last;
};

// A cut is the calm spring (damping 200) stretched to 16 frames; its accent is the moment the
// incoming field covers half the frame.
const CUT_HALF_FRAMES = (() => {
	const natural = settleFrames(100, 200);
	const p = (f: number) => springAt((f * natural) / TRANSITION_FRAMES / FPS, 100, 200);
	let lo = 0;
	let hi = TRANSITION_FRAMES;
	for (let i = 0; i < 40; i++) {
		const mid = (lo + hi) / 2;
		if (p(mid) < 0.5) lo = mid;
		else hi = mid;
	}
	return lo;
})();

const sceneStarts: number[] = [];
{
	let start = 0;
	for (const [i, s] of SCENES.entries()) {
		sceneStarts.push(start);
		start += s.frames - (i < SCENES.length - 1 ? TRANSITION_FRAMES : 0);
	}
}
// Cut frames, from "pitch" on: transition start plus the half-cover time.
const CUTS = sceneStarts.slice(1).map((f) => f + CUT_HALF_FRAMES);

// The beat grid: one constant tempo fitted (least squares) so that each cut lands on a beat.
// Beat 0 is the first cut; the beat counts between cuts make the bar structure below.
const CUT_BEATS = [0, 4, 13, 21, 27, 31];
const { t0, beat } = (() => {
	const xs = CUT_BEATS;
	const ys = CUTS.map((f) => f / FPS);
	const n = xs.length;
	const mx = xs.reduce((a, b) => a + b, 0) / n;
	const my = ys.reduce((a, b) => a + b, 0) / n;
	let sxy = 0;
	let sxx = 0;
	for (let i = 0; i < n; i++) {
		sxy += ((xs[i] as number) - mx) * ((ys[i] as number) - my);
		sxx += ((xs[i] as number) - mx) ** 2;
	}
	const slope = sxy / sxx;
	return { t0: my - slope * mx, beat: slope };
})();
const BPM = 60 / beat;
const tb = (b: number) => t0 + b * beat;
if (BPM < 110 || BPM > 124)
	throw new Error(`Fitted tempo ${BPM.toFixed(2)} BPM is outside 110 to 124.`);
for (const [i, f] of CUTS.entries()) {
	const err = (tb(CUT_BEATS[i] as number) - f / FPS) * 1000;
	if (Math.abs(err) > 20)
		throw new Error(`Cut at frame ${f} misses its beat by ${err.toFixed(1)} ms.`);
}

// Deterministic noise.
const rng = (() => {
	let a = SEED >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
})();
const noise = () => rng() * 2 - 1;

// Filters: RBJ biquads in transposed direct form II.
type Biquad = {
	b0: number;
	b1: number;
	b2: number;
	a1: number;
	a2: number;
	z1: number;
	z2: number;
};
const biquad = (
	kind: "lp" | "hp" | "bp" | "hshelf" | "lshelf" | "peak",
	f: number,
	q = Math.SQRT1_2,
	gainDb = 0,
): Biquad => {
	const bq: Biquad = { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0, z1: 0, z2: 0 };
	setBiquad(bq, kind, f, q, gainDb);
	return bq;
};
const setBiquad = (bq: Biquad, kind: string, f: number, q = Math.SQRT1_2, gainDb = 0) => {
	const w = (2 * Math.PI * Math.min(f, SR * 0.49)) / SR;
	const cw = Math.cos(w);
	const sw = Math.sin(w);
	const alpha = sw / (2 * q);
	const A = 10 ** (gainDb / 40);
	let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
	if (kind === "lp")
		[b0, b1, b2, a0, a1, a2] = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2, 1 + alpha, -2 * cw, 1 - alpha];
	else if (kind === "hp")
		[b0, b1, b2, a0, a1, a2] = [
			(1 + cw) / 2,
			-(1 + cw),
			(1 + cw) / 2,
			1 + alpha,
			-2 * cw,
			1 - alpha,
		];
	else if (kind === "bp")
		[b0, b1, b2, a0, a1, a2] = [alpha, 0, -alpha, 1 + alpha, -2 * cw, 1 - alpha];
	else if (kind === "peak")
		[b0, b1, b2, a0, a1, a2] = [
			1 + alpha * A,
			-2 * cw,
			1 - alpha * A,
			1 + alpha / A,
			-2 * cw,
			1 - alpha / A,
		];
	else {
		const sq = 2 * Math.sqrt(A) * alpha;
		if (kind === "hshelf")
			[b0, b1, b2, a0, a1, a2] = [
				A * (A + 1 + (A - 1) * cw + sq),
				-2 * A * (A - 1 + (A + 1) * cw),
				A * (A + 1 + (A - 1) * cw - sq),
				A + 1 - (A - 1) * cw + sq,
				2 * (A - 1 - (A + 1) * cw),
				A + 1 - (A - 1) * cw - sq,
			];
		else
			[b0, b1, b2, a0, a1, a2] = [
				A * (A + 1 - (A - 1) * cw + sq),
				2 * A * (A - 1 - (A + 1) * cw),
				A * (A + 1 - (A - 1) * cw - sq),
				A + 1 + (A - 1) * cw + sq,
				-2 * (A - 1 + (A + 1) * cw),
				A + 1 + (A - 1) * cw - sq,
			];
	}
	bq.b0 = b0 / a0;
	bq.b1 = b1 / a0;
	bq.b2 = b2 / a0;
	bq.a1 = a1 / a0;
	bq.a2 = a2 / a0;
};
const run = (bq: Biquad, x: number): number => {
	const y = bq.b0 * x + bq.z1;
	bq.z1 = bq.b1 * x - bq.a1 * y + bq.z2;
	bq.z2 = bq.b2 * x - bq.a2 * y;
	return y;
};

// Buses.
type Bus = { l: Float32Array; r: Float32Array };
const bus = (): Bus => ({ l: new Float32Array(N), r: new Float32Array(N) });
const drums = bus();
const bass = bus();
const music = bus();
const fx = bus();
const reverbSend = bus();
const delaySend = bus();
const put = (b: Bus, i: number, v: number, pan = 0) => {
	if (i < 0 || i >= N) return;
	const a = ((pan + 1) * Math.PI) / 4;
	b.l[i] = (b.l[i] as number) + v * Math.cos(a) * Math.SQRT2;
	b.r[i] = (b.r[i] as number) + v * Math.sin(a) * Math.SQRT2;
};
const sample = (t: number) => Math.round(t * SR);
const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);
// Smooth start and end of every voice, so nothing clicks.
const edge = (i: number, len: number, fadeIn = 48, fadeOut = 240) =>
	Math.min(1, i / fadeIn, (len - i) / fadeOut);

// Band-limited saw (polyBLEP).
const blep = (p: number, dt: number) => {
	if (p < dt) {
		const t = p / dt;
		return t + t - t * t - 1;
	}
	if (p > 1 - dt) {
		const t = (p - 1) / dt;
		return t * t + t + t + 1;
	}
	return 0;
};

// Sidechain: kick times, turned into a ducking curve after the arrangement.
const kickTimes: number[] = [];

// Instruments.
const kick = (at: number, gain = 1) => {
	kickTimes.push(at);
	const s0 = sample(at);
	const len = Math.round(0.42 * SR);
	const click = biquad("bp", 3000, 0.7);
	let ph = 0;
	for (let i = 0; i < len; i++) {
		const t = i / SR;
		const f = 54 + 95 * Math.exp(-t / 0.03) + 70 * Math.exp(-t / 0.005);
		ph += (2 * Math.PI * f) / SR;
		const env = (1 - Math.exp(-t / 0.0007)) * Math.exp(-t / 0.13);
		let v = Math.sin(ph) * env;
		v = Math.tanh(v * 1.9) / Math.tanh(1.9);
		v += run(click, noise()) * Math.exp(-t / 0.004) * 0.5;
		put(drums, s0 + i, v * gain * 0.4 * edge(i, len, 8, 2000));
	}
};

const clap = (at: number, gain = 1, pan = 0) => {
	const s0 = sample(at);
	const len = Math.round(0.35 * SR);
	const bp = biquad("bp", 1250, 0.9);
	const lp = biquad("lp", 6000);
	for (let i = 0; i < len; i++) {
		const t = i / SR;
		let env = 0;
		for (let k = 0; k < 3; k++) {
			const tk = t - k * 0.0105;
			if (tk >= 0) env += Math.exp(-tk / 0.0045) * (k === 2 ? 1 : 0.7);
		}
		if (t >= 0.021) env += 0.55 * Math.exp(-(t - 0.021) / 0.07);
		const v = run(lp, run(bp, noise())) * env * gain * 0.7 * edge(i, len, 8, 600);
		put(drums, s0 + i, v, pan);
		put(reverbSend, s0 + i, v * 0.35, pan);
	}
};

const hat = (at: number, gain = 1, open = false, pan = 0) => {
	const s0 = sample(at);
	const decay = open ? 0.13 : 0.028;
	const len = Math.round((decay * 6 + 0.01) * SR);
	const hp = biquad("hp", 6800, 0.8);
	const lp = biquad("lp", 10500);
	for (let i = 0; i < len; i++) {
		const t = i / SR;
		const v = run(lp, run(hp, noise())) * Math.exp(-t / decay) * gain * 0.3 * edge(i, len, 12, 200);
		put(drums, s0 + i, v, pan);
	}
};

const snare = (at: number, gain = 1) => {
	const s0 = sample(at);
	const len = Math.round(0.22 * SR);
	const bp = biquad("bp", 1800, 0.8);
	let ph = 0;
	for (let i = 0; i < len; i++) {
		const t = i / SR;
		ph += (2 * Math.PI * (190 + 60 * Math.exp(-t / 0.01))) / SR;
		const v =
			(run(bp, noise()) * Math.exp(-t / 0.05) * 0.7 + Math.sin(ph) * Math.exp(-t / 0.03) * 0.35) *
			gain *
			0.5 *
			edge(i, len, 8, 300);
		put(drums, s0 + i, v);
		put(reverbSend, s0 + i, v * 0.2);
	}
};

const bassNote = (at: number, dur: number, midi: number, gain = 1, ring = 0) => {
	const s0 = sample(at);
	// `ring` > 0 lets the note die away (time constant in seconds) instead of holding.
	const rel = ring > 0 ? 0.25 : 0.03;
	const len = Math.round((dur + rel) * SR);
	const f = mtof(midi);
	const lp = biquad("lp", 400, 1.0);
	let p1 = rng();
	let p2 = rng();
	let ps = 0;
	const d1 = (f * 2 ** (4 / 1200)) / SR;
	const d2 = (f * 2 ** (-4 / 1200)) / SR;
	for (let i = 0; i < len; i++) {
		const t = i / SR;
		if (i % 16 === 0) setBiquad(lp, "lp", 260 + 1500 * Math.exp(-t / 0.075), 1.1);
		p1 += d1;
		if (p1 >= 1) p1 -= 1;
		p2 += d2;
		if (p2 >= 1) p2 -= 1;
		ps += (2 * Math.PI * f) / SR;
		const saw = (2 * p1 - 1 - blep(p1, d1) + (2 * p2 - 1 - blep(p2, d2))) * 0.5;
		const hold = (0.75 + 0.25 * Math.exp(-t / 0.06)) * (ring > 0 ? Math.exp(-t / ring) : 1);
		const amp = t < dur ? hold : hold * Math.max(0, 1 - (t - dur) / rel);
		const v = (run(lp, saw) * 0.9 + Math.sin(ps) * 0.28) * amp * gain * 0.42 * edge(i, len, 96, 48);
		put(bass, s0 + i, v);
	}
};

// Warm FM electric piano for the chords.
const keyNote = (at: number, dur: number, midi: number, gain = 1, pan = 0, send = 0.25) => {
	const s0 = sample(at);
	const rel = 0.12;
	const len = Math.round((dur + rel) * SR);
	const f = mtof(midi);
	const lp = biquad("lp", 5200);
	for (let i = 0; i < len; i++) {
		const t = i / SR;
		const index = 1.9 * Math.exp(-t / 0.22) + 0.25;
		const mod = Math.sin(2 * Math.PI * f * t) * index;
		const car = Math.sin(2 * Math.PI * f * t + mod);
		const car2 = Math.sin(2 * Math.PI * f * 1.0015 * t + mod * 0.8);
		const amp = Math.exp(-t / 1.4) * (t < dur ? 1 : Math.max(0, 1 - (t - dur) / rel));
		const v = run(lp, (car + car2) * 0.5) * amp * gain * 0.2 * edge(i, len, 96, 96);
		put(music, s0 + i, v, pan);
		put(reverbSend, s0 + i, v * send, pan);
	}
};

// Soft detuned-saw pad under everything.
const padNote = (at: number, dur: number, midi: number, gain = 1, cutoff = 1600) => {
	const s0 = sample(at);
	const att = 0.35;
	const rel = 0.6;
	const len = Math.round((dur + rel) * SR);
	const f = mtof(midi);
	const voices = [-9, -3, 3, 9].map((c, k) => ({
		p: rng(),
		d: (f * 2 ** (c / 1200)) / SR,
		pan: k % 2 === 0 ? -0.6 : 0.6,
		lp: biquad("lp", cutoff, 0.6),
	}));
	for (let i = 0; i < len; i++) {
		const t = i / SR;
		const amp =
			Math.min(1, t / att) ** 2 *
			(t < dur ? 1 : Math.max(0, 1 - (t - dur) / rel) ** 2) *
			gain *
			0.05;
		for (const v of voices) {
			v.p += v.d;
			if (v.p >= 1) v.p -= 1;
			const s = run(v.lp, 2 * v.p - 1 - blep(v.p, v.d)) * amp * edge(i, len, 96, 96);
			put(music, s0 + i, s, v.pan);
			put(reverbSend, s0 + i, s * 0.3, v.pan);
		}
	}
};

// Short FM pluck for arpeggios and the motif, sent to the delay.
const pluck = (at: number, midi: number, gain = 1, pan = 0, decay = 0.22) => {
	const s0 = sample(at);
	const len = Math.round(decay * 5 * SR);
	const f = mtof(midi);
	const lp = biquad("lp", 6000);
	for (let i = 0; i < len; i++) {
		const t = i / SR;
		const mod = Math.sin(2 * Math.PI * f * 2 * t) * (1.6 * Math.exp(-t / 0.04));
		const v =
			run(lp, Math.sin(2 * Math.PI * f * t + mod)) *
			Math.exp(-t / decay) *
			gain *
			0.17 *
			edge(i, len, 48, 200);
		put(music, s0 + i, v, pan);
		put(delaySend, s0 + i, v * 0.45, pan);
		put(reverbSend, s0 + i, v * 0.2, pan);
	}
};

// Soft bell for the mark and the end card's tag.
const bell = (at: number, midi: number, gain = 1, pan = 0) => {
	const s0 = sample(at);
	const len = Math.round(2.2 * SR);
	const f = mtof(midi);
	for (let i = 0; i < len; i++) {
		const t = i / SR;
		const mod = Math.sin(2 * Math.PI * f * 2 * t) * (1.1 * Math.exp(-t / 0.15));
		const v =
			Math.sin(2 * Math.PI * f * t + mod) *
			Math.exp(-t / 0.55) *
			gain *
			0.07 *
			edge(i, len, 48, 4000);
		put(music, s0 + i, v, pan);
		put(reverbSend, s0 + i, v * 0.5, pan);
		put(delaySend, s0 + i, v * 0.25, pan);
	}
};

// Scene accent: a low boom, a soft filtered crash and a whoosh that follows the slide.
const impact = (at: number, size: number, panFrom: number) => {
	// Whoosh: rises over the 0.3 s before the cut, falls after it.
	const pre = 0.3;
	const post = 0.45;
	const w0 = sample(at - pre);
	const wlen = Math.round((pre + post) * SR);
	const wbp = biquad("bp", 500, 1.2);
	for (let i = 0; i < wlen; i++) {
		const t = i / SR - pre;
		const fc = t < 0 ? 500 + 2600 * (1 + t / pre) ** 2 : 3100 * Math.exp(-t / 0.18) + 400;
		if (i % 16 === 0) setBiquad(wbp, "bp", fc, 1.2);
		const amp = t < 0 ? (1 + t / pre) ** 2.5 : Math.exp(-t / 0.12);
		const pan = t < 0 ? panFrom * (-t / pre) : 0;
		put(fx, w0 + i, run(wbp, noise()) * amp * size * 0.32 * edge(i, wlen, 96, 480), pan);
	}
	// Boom.
	const s0 = sample(at);
	const blen = Math.round(1.4 * SR);
	let ph = 0;
	for (let i = 0; i < blen; i++) {
		const t = i / SR;
		ph += (2 * Math.PI * (52 + 40 * Math.exp(-t / 0.09))) / SR;
		const v =
			Math.tanh(Math.sin(ph) * 1.4) * Math.exp(-t / 0.38) * size * 0.16 * edge(i, blen, 24, 4000);
		put(fx, s0 + i, v);
	}
	// Crash: two decorrelated noise streams, band-limited so it stays soft.
	const clen = Math.round(2.4 * SR);
	const hl = biquad("hp", 600);
	const hr = biquad("hp", 600);
	const ll = biquad("lp", 6500);
	const lr = biquad("lp", 6500);
	for (let i = 0; i < clen; i++) {
		const t = i / SR;
		const env =
			(1 - Math.exp(-t / 0.003)) * Math.exp(-t / 0.55) * size * 0.1 * edge(i, clen, 24, 8000);
		const l = run(ll, run(hl, noise())) * env;
		const r = run(lr, run(hr, noise())) * env;
		const idx = s0 + i;
		if (idx < N) {
			fx.l[idx] = (fx.l[idx] as number) + l;
			fx.r[idx] = (fx.r[idx] as number) + r;
			reverbSend.l[idx] = (reverbSend.l[idx] as number) + l * 0.3;
			reverbSend.r[idx] = (reverbSend.r[idx] as number) + r * 0.3;
		}
	}
};

// Riser: band-passed noise and a sine gliding up an octave, ending exactly at `to`.
const riser = (from: number, to: number, gain = 1) => {
	const s0 = sample(from);
	const len = sample(to) - s0;
	const bp = biquad("bp", 300, 1.4);
	let ph = 0;
	for (let i = 0; i < len; i++) {
		const x = i / len;
		if (i % 16 === 0) setBiquad(bp, "bp", 300 * 2 ** (4 * x), 1.4);
		ph += (2 * Math.PI * 220 * 2 ** x) / SR;
		const amp = x ** 2 * gain;
		const v = (run(bp, noise()) * 0.3 + Math.sin(ph) * 0.04) * amp * edge(i, len, 96, 240);
		put(fx, s0 + i, v, Math.sin(x * Math.PI * 3) * 0.3 * x);
		put(reverbSend, s0 + i, v * 0.3);
	}
};

// Harmony in F major. Each chord: bass note and keys voicing (MIDI).
type Chord = { bass: number; keys: number[] };
const C: Record<string, Chord> = {
	Fmaj9: { bass: 41, keys: [57, 60, 64, 67] },
	Am7: { bass: 45, keys: [55, 60, 64, 69] },
	Bbmaj7: { bass: 46, keys: [57, 62, 65, 69] },
	C: { bass: 48, keys: [55, 60, 64, 67] },
	Dm9: { bass: 50, keys: [57, 60, 64, 65] },
	BbLift: { bass: 46, keys: [62, 65, 69, 72] },
	Csus: { bass: 48, keys: [60, 65, 67, 72] },
	Cmaj: { bass: 48, keys: [60, 64, 67, 72] },
	Dm7: { bass: 50, keys: [57, 60, 62, 65] },
	Fend: { bass: 41, keys: [53, 57, 60, 65, 67, 72] },
};
// [first beat, beats, chord]: the bars between cuts (beat 12 and beats 25-26 are the odd bars,
// filled by drum fills, so every cut lands on a downbeat).
const PLAN: Array<[number, number, Chord]> = [
	[0, 4, C.Fmaj9 as Chord], // pitch
	[4, 4, C.Am7 as Chord], // code
	[8, 4, C.Bbmaj7 as Chord],
	[12, 1, C.C as Chord], // fill into reasons
	[13, 4, C.Fmaj9 as Chord], // reasons
	[17, 4, C.Dm9 as Chord],
	[21, 4, C.BbLift as Chord], // speed: the lift
	[25, 1, C.Csus as Chord],
	[26, 1, C.Cmaj as Chord], // roll into install
	[27, 2, C.Dm7 as Chord], // install
	[29, 2, C.C as Chord],
];
const chordAt = (b: number): Chord => {
	for (const [start, len, ch] of PLAN) if (b >= start && b < start + len) return ch;
	return C.Fend as Chord;
};

// Arrangement.
const END_BEAT = 31;

// Intro, under the mark (frames 0 to the first cut): a pad swell, a three-note strum as the three
// frames of the mark land (frames 7, 10, 13: the brand spring reaches 1 seven frames after each
// delay), quiet ticks as the letters rise, a riser into the first downbeat.
padNote(0.0, tb(0) - 0.05, 53, 0.9, 1100);
for (const m of [57, 60, 64]) padNote(0.0, tb(0) - 0.05, m, 0.9, 1100);
for (const [k, m] of [72, 76, 79].entries()) bell((7 + 3 * k) / FPS, m, 0.9, (k - 1) * 0.3);
for (const [k, m] of [84, 86, 88, 91, 93].entries())
	bell((12 + 2 * k) / FPS, m, 0.22, -0.4 + 0.2 * k);
riser(0.55, tb(0), 0.8);

// Cut accents, sized by the cut's weight; the whoosh pans from where the slide enters (right).
const ACCENT_SIZE = [1.0, 0.7, 0.75, 1.0, 0.7, 1.15];
for (const [k, b] of CUT_BEATS.entries()) impact(tb(b), ACCENT_SIZE[k] as number, 0.6);

// Drums, beat by beat up to the end hit.
for (let b = 0; b < END_BEAT; b++) {
	const t = tb(b);
	const inBar =
		b < 12 ? (b - 0) % 4 : b < 13 ? 0 : b < 25 ? (b - 13) % 4 : b < 27 ? b - 25 : (b - 27) % 4;
	const section =
		b < 4 ? "pitch" : b < 13 ? "code" : b < 21 ? "reasons" : b < 27 ? "speed" : "install";
	const isFill = b === 12;
	const isRoll = b === 25 || b === 26;
	kick(t, inBar === 0 ? 1 : 0.9);
	if (section !== "pitch" && !isFill && !isRoll && (inBar === 1 || inBar === 3)) clap(t, 0.9);
	if (section === "pitch" && b === 3) clap(t + beat * 0.5, 0.5);
	// Hats: offbeat always; 16ths from code on; open hats in reasons and speed.
	const open = (section === "reasons" || section === "speed") && !isRoll;
	hat(t + beat * 0.5, section === "pitch" ? 0.7 : 1, open, 0.2);
	if (section !== "pitch" && !isRoll) {
		hat(t + beat * 0.25, 0.4, false, -0.25);
		hat(t + beat * 0.75, 0.45, false, -0.25);
	}
	if (isFill) for (let k = 0; k < 4; k++) snare(t + (k * beat) / 4, 0.45 + 0.15 * k);
	if (isRoll) {
		const steps = b === 25 ? 4 : 8;
		for (let k = 0; k < steps; k++) {
			// The last eighth before install stays empty, so the cut hit stands out.
			if (b === 26 && k >= 6) continue;
			const x = (b - 25 + k / steps) / 2;
			snare(t + (k * beat) / steps, 0.3 + 0.6 * x);
		}
	}
	if (b === 30) {
		snare(t + beat * 0.5, 0.5);
		snare(t + beat * 0.75, 0.7);
	}
}
riser(tb(23), tb(27), 0.7); // the lift builds into install
riser(tb(29), tb(31), 0.55); // and into the end card

// Bass: off-beat eighths, root on the chord change.
for (let b = 0; b < END_BEAT; b++) {
	const ch = chordAt(b);
	const t = tb(b);
	const first = PLAN.some(([s]) => s === b);
	if (first && b !== 0) bassNote(t, beat * 0.4, ch.bass, 0.8);
	bassNote(t + beat * 0.5, beat * 0.42, ch.bass + (b % 4 === 3 && b >= 13 ? 12 : 0), 1);
}

// Keys: sustained chord on the pitch bar, syncopated stabs after it, sparse in install.
const STAB = [0, 0.75, 1.5, 2.5, 3.25];
for (const [start, len, ch] of PLAN) {
	const t = tb(start);
	const spread = (k: number, n: number) => (k / (n - 1) - 0.5) * 0.6;
	if (start === 0) {
		for (const [k, m] of ch.keys.entries())
			keyNote(t, beat * 3.6, m, 0.9, spread(k, ch.keys.length));
		continue;
	}
	const pattern = start >= 27 ? [0, 1.5] : start >= 21 && start < 25 ? [0, 1.5, 3] : STAB;
	for (const p of pattern) {
		if (p >= len) continue;
		for (const [k, m] of ch.keys.entries())
			keyNote(
				t + p * beat,
				beat * (p === 0 ? 0.45 : 0.3),
				m,
				p === 0 ? 0.85 : 0.65,
				spread(k, ch.keys.length),
			);
	}
	// Pad underneath from code on; brighter in the speed lift.
	if (start >= 4) {
		const cutoff = start >= 21 && start < 27 ? 3200 : 1500;
		for (const m of ch.keys) padNote(t, beat * len - 0.05, m - 12 < 50 ? m : m - 12, 0.8, cutoff);
	}
}

// Motif in reasons: eighths on the pluck, through the dotted-eighth delay.
const MOTIF: Array<[number, number]> = [
	[0, 72],
	[1, 69],
	[1.5, 72],
	[2, 77],
	[3, 76],
	[3.5, 72],
	[4, 74],
	[5, 72],
	[5.5, 69],
	[6, 72],
	[7, 65],
	[7.5, 69],
];
for (const [p, m] of MOTIF) pluck(tb(13) + p * beat, m, 0.85, 0.15);

// The lift on the speed numbers: an ascending sixteenth arpeggio, swelling, and a tick as each bar
// of the chart starts to grow (frames 14 + 3k after the scene starts).
const ARP = [62, 65, 69, 72, 74, 77, 81, 84];
for (let k = 0; k < 24; k++) {
	const b = 21 + k / 4;
	const ch = chordAt(b);
	const tones = ch === C.BbLift ? ARP : [60, 65, 67, 72, 77, 79, 84, 89];
	const m = tones[(k % 8) + 0] as number;
	pluck(tb(21) + (k * beat) / 4, m, 0.5 + 0.5 * (k / 24), k % 2 === 0 ? -0.35 : 0.35, 0.16);
}
const speedStart = sceneStarts[4] as number;
for (let k = 0; k < 6; k++)
	bell(
		(speedStart + 14 + 3 * k) / FPS,
		[77, 81, 84, 86, 89, 93][k] as number,
		0.35,
		k % 2 ? 0.4 : -0.4,
	);

// The end card: one resolved hit on F, everything else stops, the chord rings out. A bell answers
// the "Open source." tag, which pops at frame 18 of the scene.
const tEnd = tb(END_BEAT);
kick(tEnd, 1.1);
bassNote(tEnd, 2.0, 41, 1.1, 0.6);
for (const [k, m] of (C.Fend as Chord).keys.entries())
	keyNote(tEnd, 2.2, m, 0.95, (k / 5 - 0.5) * 0.7, 0.4);
for (const m of [53, 57, 60, 64, 67]) padNote(tEnd, 1.4, m, 1.0, 1800);
pluck(tEnd, 77, 0.8, 0, 0.5);
const endStart = sceneStarts[6] as number;
bell((endStart + 18 + 5) / FPS, 84, 0.6, 0.2);

// Mixing.
// Sidechain ducking curve from the kicks (not the end hit, which should ring).
const duck = new Float32Array(N).fill(1);
for (const tk of kickTimes) {
	if (tk >= tEnd - 0.001) continue;
	const s0 = sample(tk);
	for (let i = 0; i < 0.35 * SR; i++) {
		const idx = s0 + i;
		if (idx >= N) break;
		const t = i / SR;
		const d = 1 - 0.55 * Math.min(1, t / 0.004) * Math.exp(-t / 0.09);
		duck[idx] = Math.min(duck[idx] as number, d);
	}
}

// Freeverb-style reverb (8 combs, 4 allpasses per side), filtered send.
const reverb = (send: Bus): Bus => {
	const out = bus();
	const scale = SR / 44100;
	const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
	const aps = [556, 441, 341, 225];
	const hp = [biquad("hp", 280), biquad("hp", 280)];
	const lp = [biquad("lp", 6500), biquad("lp", 6500)];
	for (const [ch, src, dst] of [
		[0, send.l, out.l],
		[1, send.r, out.r],
	] as const) {
		const spread = ch === 0 ? 0 : 23;
		const cb = combs.map((c) => ({
			buf: new Float32Array(Math.round((c + spread) * scale)),
			i: 0,
			f: 0,
		}));
		const ab = aps.map((a) => ({ buf: new Float32Array(Math.round((a + spread) * scale)), i: 0 }));
		const feedback = 0.8;
		const damp = 0.35;
		for (let n = 0; n < N; n++) {
			const x = run(lp[ch] as Biquad, run(hp[ch] as Biquad, src[n] as number)) * 0.015;
			let y = 0;
			for (const c of cb) {
				const o = c.buf[c.i] as number;
				c.f = o * (1 - damp) + c.f * damp;
				c.buf[c.i] = x + c.f * feedback;
				c.i = (c.i + 1) % c.buf.length;
				y += o;
			}
			for (const a of ab) {
				const o = a.buf[a.i] as number;
				a.buf[a.i] = y + o * 0.5;
				a.i = (a.i + 1) % a.buf.length;
				y = o - y;
			}
			dst[n] = y;
		}
	}
	return out;
};

// Ping-pong delay at a dotted eighth.
const delay = (send: Bus): Bus => {
	const out = bus();
	const d = Math.round(beat * 0.75 * SR);
	const lp = [biquad("lp", 3800), biquad("lp", 3800)];
	const hp = [biquad("hp", 350), biquad("hp", 350)];
	const bl = new Float32Array(d);
	const br = new Float32Array(d);
	let i = 0;
	for (let n = 0; n < N; n++) {
		const ol = bl[i] as number;
		const or = br[i] as number;
		const inMono = ((send.l[n] as number) + (send.r[n] as number)) * 0.5;
		bl[i] = run(lp[0] as Biquad, run(hp[0] as Biquad, inMono + or * 0.38));
		br[i] = run(lp[1] as Biquad, run(hp[1] as Biquad, ol * 0.38));
		i = (i + 1) % d;
		out.l[n] = ol;
		out.r[n] = or;
	}
	return out;
};

const rev = reverb(reverbSend);
const dly = delay(delaySend);

const mixL = new Float32Array(N);
const mixR = new Float32Array(N);
for (let n = 0; n < N; n++) {
	const dk = duck[n] as number;
	const md = 1 - (1 - dk) * 0.6;
	mixL[n] =
		(drums.l[n] as number) * 0.9 +
		(bass.l[n] as number) * dk +
		(music.l[n] as number) * md +
		(fx.l[n] as number) * 0.85 +
		(rev.l[n] as number) * 0.9 * md +
		(dly.l[n] as number) * 0.5;
	mixR[n] =
		(drums.r[n] as number) * 0.9 +
		(bass.r[n] as number) * dk +
		(music.r[n] as number) * md +
		(fx.r[n] as number) * 0.85 +
		(rev.r[n] as number) * 0.9 * md +
		(dly.r[n] as number) * 0.5;
}

// Master EQ: high-pass at 38 Hz, a low shelf at 90 Hz (fourth order: no DC, no sub rumble phones cannot play), a small
// dip at 220 Hz against mud, a gentle high shelf and low-pass against harshness.
const masterEq = (x: Float32Array) => {
	const chain = [
		biquad("hp", 38, 0.54),
		biquad("hp", 38, 1.31),
		biquad("lshelf", 90, 0.7, -3),
		biquad("peak", 220, 0.9, -1.5),
		biquad("peak", 3000, 0.7, 2.5),
		biquad("hshelf", 8000, 0.7, -1.5),
		biquad("lp", 15000, Math.SQRT1_2),
	];
	for (let n = 0; n < N; n++) {
		let v = x[n] as number;
		for (const bq of chain) v = run(bq, v);
		x[n] = v;
	}
};
masterEq(mixL);
masterEq(mixR);

// ITU-R BS.1770-4 integrated loudness (K-weighting at 48 kHz, 400 ms blocks, gated).
const loudness = (l: Float32Array, r: Float32Array): number => {
	const kw = (x: Float32Array) => {
		const s1: Biquad = {
			b0: 1.53512485958697,
			b1: -2.69169618940638,
			b2: 1.19839281085285,
			a1: -1.69065929318241,
			a2: 0.73248077421585,
			z1: 0,
			z2: 0,
		};
		const s2: Biquad = {
			b0: 1,
			b1: -2,
			b2: 1,
			a1: -1.99004745483398,
			a2: 0.99007225036621,
			z1: 0,
			z2: 0,
		};
		const y = new Float64Array(x.length);
		for (let n = 0; n < x.length; n++) y[n] = run(s2, run(s1, x[n] as number)) ** 2;
		return y;
	};
	const kl = kw(l);
	const kr = kw(r);
	const block = 0.4 * SR;
	const hop = 0.1 * SR;
	const zs: number[] = [];
	for (let s = 0; s + block <= N; s += hop) {
		let sum = 0;
		for (let n = s; n < s + block; n++) sum += (kl[n] as number) + (kr[n] as number);
		zs.push(sum / block);
	}
	const lk = (z: number) => -0.691 + 10 * Math.log10(z);
	const abs = zs.filter((z) => lk(z) > -70);
	const meanAbs = abs.reduce((a, b) => a + b, 0) / abs.length;
	const rel = abs.filter((z) => lk(z) > lk(meanAbs) - 10);
	return lk(rel.reduce((a, b) => a + b, 0) / rel.length);
};

// Gentle glue compression (stereo-linked, 2:1 above -18 dBFS of the pre-normalised mix).
const compress = (l: Float32Array, r: Float32Array) => {
	const att = Math.exp(-1 / (0.01 * SR));
	const relc = Math.exp(-1 / (0.15 * SR));
	let env = 0;
	for (let n = 0; n < N; n++) {
		const x = Math.max(Math.abs(l[n] as number), Math.abs(r[n] as number));
		env = x > env ? att * env + (1 - att) * x : relc * env + (1 - relc) * x;
		const db = 20 * Math.log10(env + 1e-9);
		const over = db - -18;
		const g = over > 0 ? 10 ** ((-over * 0.5) / 20) : 1;
		l[n] = (l[n] as number) * g;
		r[n] = (r[n] as number) * g;
	}
};

// Brickwall limiter, offline: the gain is the minimum of the required gain over a window, then
// averaged over the same window (so it never exceeds the requirement), then released slowly.
const CEILING_DB = -1.0;
const limit = (l: Float32Array, r: Float32Array, gain: number) => {
	const ceiling = 10 ** (CEILING_DB / 20);
	const L = 120;
	const req = new Float32Array(N);
	for (let n = 0; n < N; n++) {
		const p = Math.max(Math.abs(l[n] as number), Math.abs(r[n] as number)) * gain;
		req[n] = p > ceiling ? ceiling / p : 1;
	}
	const mn = new Float32Array(N);
	const dq: number[] = [];
	let head = 0;
	// Sliding minimum over [n - L, n + L].
	for (let n = 0; n < N + L; n++) {
		if (n < N) {
			while (dq.length > head && (req[dq[dq.length - 1] as number] as number) >= (req[n] as number))
				dq.pop();
			dq.push(n);
		}
		const c = n - L;
		if (c >= 0) {
			while ((dq[head] as number) < c - L) head++;
			mn[c] = req[dq[head] as number] as number;
		}
	}
	// Moving average over [n - L, n + L] from prefix sums (outside the file the gain is 1).
	const prefix = new Float64Array(N + 1);
	for (let n = 0; n < N; n++) prefix[n + 1] = (prefix[n] as number) + (mn[n] as number);
	const g = new Float32Array(N);
	const W = 2 * L + 1;
	for (let n = 0; n < N; n++) {
		const a = Math.max(0, n - L);
		const b = Math.min(N, n + L + 1);
		g[n] = ((prefix[b] as number) - (prefix[a] as number) + (W - (b - a))) / W;
	}
	const relCoef = 1 - Math.exp(-1 / (0.08 * SR));
	let prev = 1;
	const outL = new Float32Array(N);
	const outR = new Float32Array(N);
	for (let n = 0; n < N; n++) {
		const target = Math.min(g[n] as number, req[n] as number);
		prev = Math.min(target, prev + (1 - prev) * relCoef);
		outL[n] = (l[n] as number) * gain * prev;
		outR[n] = (r[n] as number) * gain * prev;
	}
	return { l: outL, r: outR };
};

// Normalise, compress, then search the gain into the limiter that gives -16 LUFS.
const TARGET_LUFS = -16;
{
	const pre = 10 ** ((-20 - loudness(mixL, mixR)) / 20);
	for (let n = 0; n < N; n++) {
		mixL[n] = (mixL[n] as number) * pre;
		mixR[n] = (mixR[n] as number) * pre;
	}
}
compress(mixL, mixR);

// The end: the tail decays naturally; a last fade makes the final frames silent.
const fadeStart = 19.0;
const fadeEnd = TOTAL_FRAMES / FPS - 0.12;
for (let n = 0; n < N; n++) {
	const t = n / SR;
	const f =
		t < fadeStart
			? 1
			: t > fadeEnd
				? 0
				: 0.5 + 0.5 * Math.cos((Math.PI * (t - fadeStart)) / (fadeEnd - fadeStart));
	mixL[n] = (mixL[n] as number) * f;
	mixR[n] = (mixR[n] as number) * f;
}

let gain = 1;
let out = limit(mixL, mixR, gain);
let lufs = loudness(out.l, out.r);
for (let k = 0; k < 6 && Math.abs(lufs - TARGET_LUFS) > 0.05; k++) {
	gain *= 10 ** ((TARGET_LUFS - lufs) / 20);
	out = limit(mixL, mixR, gain);
	lufs = loudness(out.l, out.r);
}

// 16-bit with TPDF dither (seeded, so the file is byte-identical on every run).
const pcm = Buffer.alloc(44 + N * 4);
pcm.write("RIFF", 0);
pcm.writeUInt32LE(36 + N * 4, 4);
pcm.write("WAVE", 8);
pcm.write("fmt ", 12);
pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20);
pcm.writeUInt16LE(2, 22);
pcm.writeUInt32LE(SR, 24);
pcm.writeUInt32LE(SR * 4, 28);
pcm.writeUInt16LE(4, 32);
pcm.writeUInt16LE(16, 34);
pcm.write("data", 36);
pcm.writeUInt32LE(N * 4, 40);
let peak = 0;
const q = (v: number) => {
	const silent = v === 0;
	const d = silent ? 0 : rng() - rng();
	return Math.max(-32768, Math.min(32767, Math.round(v * 32767 + d)));
};
for (let n = 0; n < N; n++) {
	const l = out.l[n] as number;
	const r = out.r[n] as number;
	peak = Math.max(peak, Math.abs(l), Math.abs(r));
	pcm.writeInt16LE(q(l), 44 + n * 4);
	pcm.writeInt16LE(q(r), 46 + n * 4);
}
writeFileSync(OUT, pcm);

console.log(`wrote ${OUT}`);
console.log(
	`length ${N} samples = ${(N / SR).toFixed(3)} s = ${TOTAL_FRAMES} frames at ${FPS} fps`,
);
console.log(
	`tempo ${BPM.toFixed(2)} BPM, beat 0 at ${t0.toFixed(3)} s, cut half-cover ${CUT_HALF_FRAMES.toFixed(2)} frames`,
);
for (const [i, f] of CUTS.entries()) {
	const b = CUT_BEATS[i] as number;
	console.log(
		`cut ${SCENES[i + 1]?.id.padEnd(8)} frame ${f.toFixed(2)} (${(f / FPS).toFixed(3)} s) -> beat ${b} at ${tb(b).toFixed(3)} s, off ${((tb(b) - f / FPS) * 1000).toFixed(1)} ms`,
	);
}
console.log(
	`integrated ${lufs.toFixed(2)} LUFS (internal meter), sample peak ${(20 * Math.log10(peak)).toFixed(2)} dBFS`,
);
