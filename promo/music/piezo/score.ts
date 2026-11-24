// The teaser arrangement as note sequences, one per piezo instrument: promo/music/piezo/score.json.
// The timeline, tempo fit and arrangement are the same as sketches/sketch-keys.ts (the code-synth version);
// here they become {time_s, note, velocity, duration_s} lists, the format of a piezo moment.
// Run: node promo/music/piezo/score.ts (Node 24+).

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FPS = 30;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "score.json");

// Timeline, mirrored from sketches/sketch-keys.ts (which mirrors promo/src/teaser/Teaser.tsx).
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
const settleFrames = (stiffness: number, damping: number): number => {
	let last = 0;
	for (let f = 0; f < 5000; f++)
		if (Math.abs(1 - springAt(f / FPS, stiffness, damping)) > 0.005) last = f + 1;
	return last;
};
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
const CUTS = sceneStarts.slice(1).map((f) => f + CUT_HALF_FRAMES);
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
const tb = (b: number) => t0 + b * beat;

// Note lists per instrument. Velocity is 0 to 1 (piezo's range), so each part scales its gains.
type Note = { time_s: number; note: number; velocity: number; duration_s: number };
const parts: Record<string, Note[]> = {};
const add = (part: string, time: number, note: number, velocity: number, duration: number) => {
	if (time < 0) throw new Error(`${part}: note before 0 s`);
	parts[part] ??= [];
	parts[part].push({
		time_s: Math.round(time * 1e6) / 1e6,
		note,
		velocity: Math.round(Math.min(1, Math.max(0.01, velocity)) * 1e4) / 1e4,
		duration_s: Math.round(duration * 1e6) / 1e6,
	});
};

// One-shot drums: a short gate is enough (the Tamburo ignores how long the gate stays open).
const HIT = 0.04;
// Hats: the gate length is the decay (a gate-driven envelope after the Tamburo).
const HAT_CLOSED = 0.018;
const HAT_OPEN = 0.11;

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
const PLAN: Array<[number, number, Chord]> = [
	[0, 4, C.Fmaj9 as Chord],
	[4, 4, C.Am7 as Chord],
	[8, 4, C.Bbmaj7 as Chord],
	[12, 1, C.C as Chord],
	[13, 4, C.Fmaj9 as Chord],
	[17, 4, C.Dm9 as Chord],
	[21, 4, C.BbLift as Chord],
	[25, 1, C.Csus as Chord],
	[26, 1, C.Cmaj as Chord],
	[27, 2, C.Dm7 as Chord],
	[29, 2, C.C as Chord],
];
const chordAt = (b: number): Chord => {
	for (const [start, len, ch] of PLAN) if (b >= start && b < start + len) return ch;
	return C.Fend as Chord;
};
const END_BEAT = 31;
const tEnd = tb(END_BEAT);

// The pad's brightness rides on velocity (it opens the filter): cutoff = 600 Hz * 2^(2.5 v).
const padVelocity = (cutoff: number) => Math.log2(cutoff / 600) / 2.5;

// Intro: pad swell, the mark's three-note strum, ticks as the letters rise, a riser.
for (const m of [53, 57, 60, 64]) add("pad", 0.0, m, padVelocity(1100), tb(0) - 0.05);
for (const [k, m] of [72, 76, 79].entries()) add("bell", (7 + 3 * k) / FPS, m, 0.9, 0.3);
for (const [k, m] of [84, 86, 88, 91, 93].entries()) add("bell", (12 + 2 * k) / FPS, m, 0.25, 0.2);
// Risers: the gate length is the rise (velocity sets the level, the note is ignored).
// The riser patch reads its rise time from the note: one octave up doubles the 1 s attack.
const riser = (from: number, to: number, gain: number) =>
	add("riser", from, 60 + Math.round(12 * Math.log2(to - from)), gain, to - from);
riser(0.55, tb(0), 0.8);

// Cut accents: a boom with a soft crash on the cut, and a whoosh that rises into it.
const ACCENT_SIZE = [1.0, 0.7, 0.75, 1.0, 0.7, 1.15];
for (const [k, b] of CUT_BEATS.entries()) {
	const size = (ACCENT_SIZE[k] as number) / 1.15;
	add("impact", tb(b), 60, size, HIT);
	add("whoosh", tb(b) - 0.3, 60, size, 0.3);
}

// Drums.
for (let b = 0; b < END_BEAT; b++) {
	const t = tb(b);
	const inBar =
		b < 12 ? b % 4 : b < 13 ? 0 : b < 25 ? (b - 13) % 4 : b < 27 ? b - 25 : (b - 27) % 4;
	const section =
		b < 4 ? "pitch" : b < 13 ? "code" : b < 21 ? "reasons" : b < 27 ? "speed" : "install";
	const isFill = b === 12;
	const isRoll = b === 25 || b === 26;
	add("kick", t, 60, (inBar === 0 ? 1 : 0.9) / 1.1, HIT);
	if (section !== "pitch" && !isFill && !isRoll && (inBar === 1 || inBar === 3))
		add("clap", t, 60, 0.9, HIT);
	if (section === "pitch" && b === 3) add("clap", t + beat * 0.5, 60, 0.5, HIT);
	const open = (section === "reasons" || section === "speed") && !isRoll;
	add("hat", t + beat * 0.5, 60, section === "pitch" ? 0.7 : 1, open ? HAT_OPEN : HAT_CLOSED);
	if (section !== "pitch" && !isRoll) {
		add("hat", t + beat * 0.25, 60, 0.4, HAT_CLOSED);
		add("hat", t + beat * 0.75, 60, 0.45, HAT_CLOSED);
	}
	if (isFill)
		for (let k = 0; k < 4; k++) add("snare", t + (k * beat) / 4, 60, 0.45 + 0.15 * k, HIT);
	if (isRoll) {
		const steps = b === 25 ? 4 : 8;
		for (let k = 0; k < steps; k++) {
			if (b === 26 && k >= 6) continue;
			const x = (b - 25 + k / steps) / 2;
			add("snare", t + (k * beat) / steps, 60, 0.3 + 0.6 * x, Math.min(HIT, beat / steps / 2));
		}
	}
	if (b === 30) {
		add("snare", t + beat * 0.5, 60, 0.5, HIT);
		add("snare", t + beat * 0.75, 60, 0.7, HIT);
	}
}
riser(tb(23), tb(27), 0.7);
riser(tb(29), tb(31), 0.55);
add("kick", tEnd, 60, 1, HIT);

// Bass: off-beat eighths, root on the chord change.
for (let b = 0; b < END_BEAT; b++) {
	const ch = chordAt(b);
	const t = tb(b);
	const first = PLAN.some(([s]) => s === b);
	if (first && b !== 0) add("bass", t, ch.bass, 0.8, beat * 0.4);
	add("bass", t + beat * 0.5, ch.bass + (b % 4 === 3 && b >= 13 ? 12 : 0), 1, beat * 0.42);
}
add("bass", tEnd, 41, 1, 1.2);

// Keys: sustained chord on the pitch bar, syncopated stabs after it, sparse in install.
const STAB = [0, 0.75, 1.5, 2.5, 3.25];
for (const [start, len, ch] of PLAN) {
	const t = tb(start);
	if (start === 0) {
		for (const m of ch.keys) add("keys", t, m, 0.9, beat * 3.6);
		continue;
	}
	const pattern = start >= 27 ? [0, 1.5] : start >= 21 && start < 25 ? [0, 1.5, 3] : STAB;
	for (const p of pattern) {
		if (p >= len) continue;
		for (const m of ch.keys)
			add("keys", t + p * beat, m, p === 0 ? 0.85 : 0.65, beat * (p === 0 ? 0.45 : 0.3));
	}
	if (start >= 4) {
		const cutoff = start >= 21 && start < 27 ? 3200 : 1500;
		for (const m of ch.keys)
			add("pad", t, m - 12 < 50 ? m : m - 12, padVelocity(cutoff), beat * len - 0.05);
	}
}

// Motif in reasons, on the pluck through its dotted-eighth delay.
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
for (const [p, m] of MOTIF) add("pluck", tb(13) + p * beat, m, 0.85, beat * 0.4);

// The lift: an ascending sixteenth arpeggio that swells, and a tick as each chart bar grows.
const ARP = [62, 65, 69, 72, 74, 77, 81, 84];
for (let k = 0; k < 24; k++) {
	const b = 21 + k / 4;
	const tones = chordAt(b) === C.BbLift ? ARP : [60, 65, 67, 72, 77, 79, 84, 89];
	add("pluck", tb(21) + (k * beat) / 4, tones[k % 8] as number, 0.45 + 0.45 * (k / 24), beat / 6);
}
const speedStart = sceneStarts[4] as number;
for (let k = 0; k < 6; k++)
	add("bell", (speedStart + 14 + 3 * k) / FPS, [77, 81, 84, 86, 89, 93][k] as number, 0.35, 0.2);

// The end card: one resolved hit on F; a bell answers the "Open source." tag.
for (const m of (C.Fend as Chord).keys) add("keys", tEnd, m, 0.95, 2.2);
for (const m of [53, 57, 60, 64, 67]) add("pad", tEnd, m, padVelocity(1800), 1.4);
add("pluck", tEnd, 77, 0.8, 0.5);
add("bell", ((sceneStarts[6] as number) + 18 + 5) / FPS, 84, 0.6, 0.3);

for (const notes of Object.values(parts)) notes.sort((a, b) => a.time_s - b.time_s);
const score = {
	duration_s: TOTAL_FRAMES / FPS,
	fps: FPS,
	bpm: 60 / beat,
	beat0_s: t0,
	cuts: CUTS.map((f, i) => ({
		id: SCENES[i + 1]?.id,
		frame: f,
		beat_s: tb(CUT_BEATS[i] as number),
	})),
	parts,
};
writeFileSync(OUT, `${JSON.stringify(score, null, 1)}\n`);
console.log(`wrote ${OUT}`);
console.log(`tempo ${score.bpm.toFixed(2)} BPM, beat 0 at ${t0.toFixed(3)} s`);
for (const [k, v] of Object.entries(parts)) console.log(`${k.padEnd(7)} ${v.length} notes`);
