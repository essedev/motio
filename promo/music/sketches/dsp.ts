// Shared synthesis and mastering code for the three teaser sketches. No samples: oscillators,
// seeded noise, filters, a limiter and a BS.1770 loudness meter, all in this file.

import { writeFileSync } from "node:fs";

export const SR = 48_000;
export const FPS = 30;

// The timeline, mirrored from promo/src/teaser/Teaser.tsx: keep the two in sync.
const SCENES = [60, 75, 150, 135, 105, 75, 90];
const TRANSITION_FRAMES = 16;
export const TOTAL_FRAMES =
	SCENES.reduce((a, b) => a + b, 0) - (SCENES.length - 1) * TRANSITION_FRAMES;
export const N = Math.round((TOTAL_FRAMES / FPS) * SR);

// Spring maths as Motio computes it (damped oscillator, settled within 0.005).
const springAt = (t: number, stiffness: number, damping: number): number => {
	const zeta = damping / (2 * Math.sqrt(stiffness));
	const w0 = Math.sqrt(stiffness);
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
const natural = (() => {
	let last = 0;
	for (let f = 0; f < 5000; f++)
		if (Math.abs(1 - springAt(f / FPS, 100, 200)) > 0.005) last = f + 1;
	return last;
})();
// A cut's accent: the moment the incoming field covers half the frame (calm spring, 16 frames).
const HALF = (() => {
	let lo = 0;
	let hi = TRANSITION_FRAMES;
	for (let i = 0; i < 40; i++) {
		const mid = (lo + hi) / 2;
		if (springAt((mid * natural) / TRANSITION_FRAMES / FPS, 100, 200) < 0.5) lo = mid;
		else hi = mid;
	}
	return lo;
})();
export const SCENE_STARTS: number[] = [];
{
	let s = 0;
	for (const [i, f] of SCENES.entries()) {
		SCENE_STARTS.push(s);
		s += f - (i < SCENES.length - 1 ? TRANSITION_FRAMES : 0);
	}
}
/** Accent frames of the six cuts: pitch, code, reasons, speed, install, end. */
export const CUT_FRAMES = SCENE_STARTS.slice(1).map((f) => f + HALF);
/** The three moments the sketches accent, in seconds. The mark's front frame lands at frame 7. */
export const MARK = 7 / FPS;
export const SPEED = (CUT_FRAMES[3] as number) / FPS;
export const END = (CUT_FRAMES[5] as number) / FPS;

/** A beat grid with `beats` beats from the speed cut to the end card; beat 0 is the end card. */
export const grid = (beats: number) => {
	const beat = (END - SPEED) / beats;
	return { beat, bpm: 60 / beat, at: (b: number) => END + b * beat };
};

// Deterministic randomness.
export const makeRng = (seed: number) => {
	let a = seed >>> 0;
	const next = () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const noise = () => next() * 2 - 1;
	// Approximately normal, mean 0, standard deviation 1 (Irwin-Hall with 6 terms).
	const gauss = () => (next() + next() + next() + next() + next() + next() - 3) * Math.SQRT2;
	return { next, noise, gauss };
};
export type Rng = ReturnType<typeof makeRng>;

// RBJ biquads.
export type Biquad = {
	b0: number;
	b1: number;
	b2: number;
	a1: number;
	a2: number;
	z1: number;
	z2: number;
};
export type FilterKind = "lp" | "hp" | "bp" | "hshelf" | "lshelf" | "peak";
export const biquad = (kind: FilterKind, f: number, q = Math.SQRT1_2, gainDb = 0): Biquad => {
	const bq: Biquad = { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0, z1: 0, z2: 0 };
	setBiquad(bq, kind, f, q, gainDb);
	return bq;
};
export const setBiquad = (
	bq: Biquad,
	kind: FilterKind,
	f: number,
	q = Math.SQRT1_2,
	gainDb = 0,
) => {
	const w = (2 * Math.PI * Math.min(f, SR * 0.49)) / SR;
	const cw = Math.cos(w);
	const sw = Math.sin(w);
	const alpha = sw / (2 * q);
	const A = 10 ** (gainDb / 40);
	let c: number[];
	if (kind === "lp") c = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2, 1 + alpha, -2 * cw, 1 - alpha];
	else if (kind === "hp")
		c = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2, 1 + alpha, -2 * cw, 1 - alpha];
	else if (kind === "bp") c = [alpha, 0, -alpha, 1 + alpha, -2 * cw, 1 - alpha];
	else if (kind === "peak")
		c = [1 + alpha * A, -2 * cw, 1 - alpha * A, 1 + alpha / A, -2 * cw, 1 - alpha / A];
	else {
		const sq = 2 * Math.sqrt(A) * alpha;
		c =
			kind === "hshelf"
				? [
						A * (A + 1 + (A - 1) * cw + sq),
						-2 * A * (A - 1 + (A + 1) * cw),
						A * (A + 1 + (A - 1) * cw - sq),
						A + 1 - (A - 1) * cw + sq,
						2 * (A - 1 - (A + 1) * cw),
						A + 1 - (A - 1) * cw - sq,
					]
				: [
						A * (A + 1 - (A - 1) * cw + sq),
						2 * A * (A - 1 - (A + 1) * cw),
						A * (A + 1 - (A - 1) * cw - sq),
						A + 1 + (A - 1) * cw + sq,
						-2 * (A - 1 + (A + 1) * cw),
						A + 1 + (A - 1) * cw - sq,
					];
	}
	const [b0, b1, b2, a0, a1, a2] = c as [number, number, number, number, number, number];
	bq.b0 = b0 / a0;
	bq.b1 = b1 / a0;
	bq.b2 = b2 / a0;
	bq.a1 = a1 / a0;
	bq.a2 = a2 / a0;
};
export const run = (bq: Biquad, x: number): number => {
	const y = bq.b0 * x + bq.z1;
	bq.z1 = bq.b1 * x - bq.a1 * y + bq.z2;
	bq.z2 = bq.b2 * x - bq.a2 * y;
	return y;
};

/** Four-pole ladder low-pass with saturating feedback (resonance 0 to about 3.8). */
export const ladder = () => {
	const s = [0, 0, 0, 0];
	return (x: number, cutoff: number, res: number): number => {
		const g = 1 - Math.exp((-2 * Math.PI * Math.min(cutoff, 16000)) / SR);
		const u = Math.tanh(x * (1 + res * 0.35) - res * (s[3] as number));
		s[0] = (s[0] as number) + g * (u - (s[0] as number));
		s[1] = (s[1] as number) + g * ((s[0] as number) - (s[1] as number));
		s[2] = (s[2] as number) + g * ((s[1] as number) - (s[2] as number));
		s[3] = (s[3] as number) + g * ((s[2] as number) - (s[3] as number));
		return s[3] as number;
	};
};

// Buses.
export type Bus = { l: Float32Array; r: Float32Array };
export const bus = (): Bus => ({ l: new Float32Array(N), r: new Float32Array(N) });
export const put = (b: Bus, i: number, v: number, pan = 0) => {
	if (i < 0 || i >= N) return;
	const a = ((pan + 1) * Math.PI) / 4;
	b.l[i] = (b.l[i] as number) + v * Math.cos(a) * Math.SQRT2;
	b.r[i] = (b.r[i] as number) + v * Math.sin(a) * Math.SQRT2;
};
export const sample = (t: number) => Math.round(t * SR);
export const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);
/** Linear fades at both ends of a voice, so nothing clicks. */
export const edge = (i: number, len: number, fadeIn = 48, fadeOut = 240) =>
	Math.max(0, Math.min(1, i / fadeIn, (len - i) / fadeOut));

/** Band-limiting correction for saws and squares (polyBLEP). */
export const blep = (p: number, dt: number) => {
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

/** A ducking curve: 1 everywhere, dipping by `depth` after each trigger, recovering over `release`. */
export const duckCurve = (times: number[], depth: number, release: number, attack = 0.004) => {
	const d = new Float32Array(N).fill(1);
	for (const tk of times) {
		const s0 = sample(tk);
		const len = Math.round(release * 5 * SR);
		for (let i = 0; i < len; i++) {
			const idx = s0 + i;
			if (idx < 0 || idx >= N) continue;
			const t = i / SR;
			const v = 1 - depth * Math.min(1, t / attack) * Math.exp(-t / release);
			d[idx] = Math.min(d[idx] as number, v);
		}
	}
	return d;
};

/** Freeverb-style stereo reverb on a send bus, filtered so it never muddies the low end. */
export const reverb = (send: Bus, size = 0.8, damp = 0.35, hpHz = 300, lpHz = 6000): Bus => {
	const out = bus();
	const scale = SR / 44100;
	const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
	const aps = [556, 441, 341, 225];
	for (const [ch, src, dst] of [
		[0, send.l, out.l],
		[1, send.r, out.r],
	] as const) {
		const spread = ch === 0 ? 0 : 23;
		const hp = biquad("hp", hpHz);
		const lp = biquad("lp", lpHz);
		const cb = combs.map((c) => ({
			buf: new Float32Array(Math.round((c + spread) * scale)),
			i: 0,
			f: 0,
		}));
		const ab = aps.map((a) => ({ buf: new Float32Array(Math.round((a + spread) * scale)), i: 0 }));
		for (let n = 0; n < N; n++) {
			const x = run(lp, run(hp, src[n] as number)) * 0.015;
			let y = 0;
			for (const c of cb) {
				const o = c.buf[c.i] as number;
				c.f = o * (1 - damp) + c.f * damp;
				c.buf[c.i] = x + c.f * size;
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

// Mastering.

/** ITU-R BS.1770-4 integrated loudness (K-weighting at 48 kHz, 400 ms blocks, gated). */
export const loudness = (l: Float32Array, r: Float32Array): number => {
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
	for (let s = 0; s + block <= l.length; s += hop) {
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

/** Offline brickwall limiter: windowed minimum of the needed gain, averaged, slow release. */
const limit = (l: Float32Array, r: Float32Array, gain: number, ceilingDb: number) => {
	const ceiling = 10 ** (ceilingDb / 20);
	const L = 120;
	const req = new Float32Array(N);
	for (let n = 0; n < N; n++) {
		const p = Math.max(Math.abs(l[n] as number), Math.abs(r[n] as number)) * gain;
		req[n] = p > ceiling ? ceiling / p : 1;
	}
	const mn = new Float32Array(N);
	const dq: number[] = [];
	let head = 0;
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
	const prefix = new Float64Array(N + 1);
	for (let n = 0; n < N; n++) prefix[n + 1] = (prefix[n] as number) + (mn[n] as number);
	const W = 2 * L + 1;
	const relCoef = 1 - Math.exp(-1 / (0.08 * SR));
	let prev = 1;
	const outL = new Float32Array(N);
	const outR = new Float32Array(N);
	for (let n = 0; n < N; n++) {
		const a = Math.max(0, n - L);
		const b = Math.min(N, n + L + 1);
		const g = ((prefix[b] as number) - (prefix[a] as number) + (W - (b - a))) / W;
		prev = Math.min(Math.min(g, req[n] as number), prev + (1 - prev) * relCoef);
		outL[n] = (l[n] as number) * gain * prev;
		outR[n] = (r[n] as number) * gain * prev;
	}
	return { l: outL, r: outR };
};

export type MasterOptions = {
	/** Extra EQ on the master, after the 35 Hz high-pass. */
	eq?: Array<[FilterKind, number, number, number]>;
	/** Glue compression ratio (2:1 default) above -18 dBFS of the pre-normalised mix. */
	ratio?: number;
	/** When the last fade starts, in seconds; the file is silent from 0.12 s before its end. */
	fadeStart?: number;
	targetLufs?: number;
	ceilingDb?: number;
};

/** EQ, glue compression, final fade, then the limiter gain that lands on the target loudness. */
export const master = (mixL: Float32Array, mixR: Float32Array, o: MasterOptions = {}) => {
	const eq = (x: Float32Array) => {
		const chain = [
			biquad("hp", 35, 0.54),
			biquad("hp", 35, 1.31),
			...(o.eq ?? []).map(([k, f, q, g]) => biquad(k, f, q, g)),
			biquad("lp", 15000),
		];
		for (let n = 0; n < N; n++) {
			let v = x[n] as number;
			for (const bq of chain) v = run(bq, v);
			x[n] = v;
		}
	};
	eq(mixL);
	eq(mixR);
	const pre = 10 ** ((-20 - loudness(mixL, mixR)) / 20);
	for (let n = 0; n < N; n++) {
		mixL[n] = (mixL[n] as number) * pre;
		mixR[n] = (mixR[n] as number) * pre;
	}
	const ratio = o.ratio ?? 2;
	const att = Math.exp(-1 / (0.01 * SR));
	const rel = Math.exp(-1 / (0.15 * SR));
	let env = 0;
	for (let n = 0; n < N; n++) {
		const x = Math.max(Math.abs(mixL[n] as number), Math.abs(mixR[n] as number));
		env = x > env ? att * env + (1 - att) * x : rel * env + (1 - rel) * x;
		const over = 20 * Math.log10(env + 1e-9) + 18;
		const g = over > 0 ? 10 ** ((-over * (1 - 1 / ratio)) / 20) : 1;
		mixL[n] = (mixL[n] as number) * g;
		mixR[n] = (mixR[n] as number) * g;
	}
	const fadeStart = o.fadeStart ?? 19.0;
	const fadeEnd = N / SR - 0.12;
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
	const target = o.targetLufs ?? -16;
	const ceilingDb = o.ceilingDb ?? -1;
	let gain = 1;
	let out = limit(mixL, mixR, gain, ceilingDb);
	let lufs = loudness(out.l, out.r);
	for (let k = 0; k < 8 && Math.abs(lufs - target) > 0.05; k++) {
		gain *= 10 ** ((target - lufs) / 20);
		out = limit(mixL, mixR, gain, ceilingDb);
		lufs = loudness(out.l, out.r);
	}
	return { ...out, lufs };
};

/** 16-bit stereo WAV with seeded TPDF dither (byte-identical on every run). */
export const writeWav = (path: string, l: Float32Array, r: Float32Array, rng: Rng) => {
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
	const q = (v: number) => {
		const d = v === 0 ? 0 : rng.next() - rng.next();
		return Math.max(-32768, Math.min(32767, Math.round(v * 32767 + d)));
	};
	let peak = 0;
	for (let n = 0; n < N; n++) {
		peak = Math.max(peak, Math.abs(l[n] as number), Math.abs(r[n] as number));
		pcm.writeInt16LE(q(l[n] as number), 44 + n * 4);
		pcm.writeInt16LE(q(r[n] as number), 46 + n * 4);
	}
	writeFileSync(path, pcm);
	return 20 * Math.log10(peak);
};

/** Sums buses into a stereo mix with per-bus gain and optional ducking curve. */
export const mix = (
	parts: Array<{ bus: Bus; gain: number; duck?: Float32Array; duckAmount?: number }>,
) => {
	const l = new Float32Array(N);
	const r = new Float32Array(N);
	for (const p of parts) {
		for (let n = 0; n < N; n++) {
			const d = p.duck ? 1 - (1 - (p.duck[n] as number)) * (p.duckAmount ?? 1) : 1;
			const g = p.gain * d;
			l[n] = (l[n] as number) + (p.bus.l[n] as number) * g;
			r[n] = (r[n] as number) + (p.bus.r[n] as number) * g;
		}
	}
	return { l, r };
};
