// Mixes the audio compositions of fixtures/media with hand-written sources and compares click
// times and peaks with the Remotion recordings in fixtures/media/__golden__/remotion/media.json.
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type MixSource, mixAudio } from "./mix.js";

const media = resolve(import.meta.dirname, "../../../fixtures/media");
const golden = JSON.parse(
	readFileSync(resolve(media, "__golden__/remotion/media.json"), "utf8"),
) as {
	audio: Record<string, { t: number; peak: number }[]>;
};
const clicks = resolve(media, "public/clicks.wav");

/**
 * Same detector as tools/oracle-render/record-media.ts, on the same mono signal: the recorder
 * decodes with `-ac 1`, FFmpeg's stereo downmix `(L + R) / sqrt(2)`.
 */
function detect(samples: Float32Array, channels: number, rate: number) {
	const out: { t: number; peak: number }[] = [];
	let quiet = 1000;
	const n = samples.length / channels;
	const mono = (i: number) =>
		channels === 2
			? ((samples[i * 2] ?? 0) + (samples[i * 2 + 1] ?? 0)) * Math.SQRT1_2
			: (samples[i * channels] ?? 0);
	for (let i = 0; i < n; i++) {
		const a = Math.abs(mono(i));
		if (a > 0.02 && quiet >= 96) {
			let peak = 0;
			for (let j = i; j < Math.min(n, i + 48); j++) peak = Math.max(peak, Math.abs(mono(j)));
			out.push({ t: i / rate, peak });
		}
		quiet = a > 0.02 ? 0 : quiet + 1;
	}
	return out;
}

const ramp = (f: number) => 0.1 + 0.9 * Math.min(1, f / 60);

/**
 * Remotion applies volume changes about 1.5 frames late (D-014, fixtures/media/NOTES.md); Motio
 * applies them on time. Clicks within this window after a volume change are not compared.
 */
const LAG_WINDOW_S = 3 / 30;
const cases: {
	id: string;
	durationInFrames: number;
	source: MixSource;
	tTol: number;
	peakTol: number;
}[] = [
	{
		id: "audio-offset",
		durationInFrames: 90,
		source: { src: clicks, startFrame: 15, trimBeforeFrames: 6, durationInFrames: 75, volume: 1 },
		tTol: 0.001,
		peakTol: 0.01,
	},
	{
		id: "audio-vol25",
		durationInFrames: 30,
		source: { src: clicks, startFrame: 0, trimBeforeFrames: 0, durationInFrames: 30, volume: 0.25 },
		tTol: 0.001,
		peakTol: 0.01,
	},
	{
		id: "audio-vol50",
		durationInFrames: 30,
		source: { src: clicks, startFrame: 0, trimBeforeFrames: 0, durationInFrames: 30, volume: 0.5 },
		tTol: 0.001,
		peakTol: 0.01,
	},
	{
		id: "audio-step",
		durationInFrames: 60,
		source: {
			src: clicks,
			startFrame: 0,
			trimBeforeFrames: 0,
			durationInFrames: 60,
			volume: Array.from({ length: 60 }, (_, f) => (f < 30 ? 0.2 : 0.8)),
		},
		tTol: 0.001,
		peakTol: 0.01,
		volumeChangesAt: [1],
	},
	{
		id: "audio-ramp",
		durationInFrames: 90,
		source: {
			src: clicks,
			startFrame: 0,
			trimBeforeFrames: 0,
			durationInFrames: 90,
			volume: Array.from({ length: 90 }, (_, f) => ramp(f)),
		},
		tTol: 0.001,
		peakTol: 0.04,
	},
];

describe("mixAudio against the Remotion recordings", () => {
	for (const c of cases) {
		it(c.id, async () => {
			const mixed = await mixAudio({
				sources: [c.source],
				fps: 30,
				durationInFrames: c.durationInFrames,
			});
			const got = detect(mixed.samples, mixed.channels, mixed.sampleRate);
			const want = golden.audio[c.id] ?? [];
			expect(got.length).toBe(want.length);
			got.forEach((g, i) => {
				expect(Math.abs(g.t - (want[i]?.t ?? Number.NaN))).toBeLessThanOrEqual(c.tTol);
				const inLag = (c.volumeChangesAt ?? []).some((t) => g.t >= t && g.t < t + LAG_WINDOW_S);
				if (!inLag)
					expect(Math.abs(g.peak - (want[i]?.peak ?? Number.NaN))).toBeLessThanOrEqual(c.peakTol);
			});
		});
	}

	it("audio-rate2 places time-stretched clicks within 2 ms", async () => {
		const mixed = await mixAudio({
			sources: [
				{
					src: clicks,
					startFrame: 0,
					trimBeforeFrames: 0,
					durationInFrames: 60,
					playbackRate: 2,
					volume: 1,
				},
			],
			fps: 30,
			durationInFrames: 60,
		});
		const got = detect(mixed.samples, mixed.channels, mixed.sampleRate);
		const want = golden.audio["audio-rate2"] ?? [];
		const errors = want.map((w) => Math.min(...got.map((g) => Math.abs(g.t - w.t))));
		expect(Math.max(...errors)).toBeLessThanOrEqual(0.002);
	});
});

describe("mixAudio decodes only what plays", () => {
	let dir: string;
	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), "motio-mix-"));
	});
	afterAll(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	/** A wrapper around `tool` that logs the start and end of every run to `log`. */
	function logged(tool: string, log: string): string {
		const path = join(dir, `${tool}-logged.sh`);
		writeFileSync(
			path,
			`#!/bin/sh\necho "start $$ $*" >> "${log}"\n${tool} "$@"\nrc=$?\necho "end $$" >> "${log}"\nexit $rc\n`,
		);
		chmodSync(path, 0o755);
		return path;
	}

	it("bounds each decode, caps the FFmpeg processes and probes each source once", async () => {
		const log = join(dir, "runs.log");
		writeFileSync(log, "");
		// Twelve one-second segments of the same 4 s source at different trims.
		const sources: MixSource[] = Array.from({ length: 12 }, (_, i) => ({
			src: clicks,
			startFrame: i * 2,
			trimBeforeFrames: i * 7,
			durationInFrames: 30,
			volume: 0.1,
		}));
		await mixAudio({
			sources,
			fps: 30,
			durationInFrames: 60,
			concurrency: 3,
			ffmpeg: logged("ffmpeg", log),
			ffprobe: logged("ffprobe", log),
		});
		const lines = readFileSync(log, "utf8").trim().split("\n");
		const starts = lines.filter((l) => l.startsWith("start "));
		const probes = starts.filter((l) => l.includes("-show_entries"));
		const decodes = starts.filter((l) => !l.includes("-show_entries"));
		expect(probes).toHaveLength(1);
		expect(decodes).toHaveLength(12);
		// Every decode stops after the segment's duration.
		for (const d of decodes) expect(d).toMatch(/ -t \d/);
		let running = 0;
		let peak = 0;
		for (const l of lines) {
			running += l.startsWith("start ") ? 1 : -1;
			peak = Math.max(peak, running);
		}
		expect(peak).toBeLessThanOrEqual(3);
	});

	/** Every sample of `file` as mono floats at 48 kHz. */
	function decodeAll(file: string): Float32Array {
		const r = spawnSync(
			"ffmpeg",
			["-v", "error", "-i", file, "-ac", "1", "-ar", "48000", "-f", "f32le", "-"],
			{ maxBuffer: 1 << 28 },
		);
		if (r.status !== 0) throw new Error(String(r.stderr));
		const out = new Float32Array(r.stdout.length / 4);
		new Uint8Array(out.buffer).set(r.stdout.subarray(0, out.length * 4));
		return out;
	}

	// A seek before the input must not move the samples: WAV and MP3 decode identically, AAC
	// within its decoder's rounding, and Matroska (whose seeks land 1 ms off) is not sought.
	const tone = resolve(media, "public/tone.wav");
	for (const [ext, codec, tol] of [
		["wav", "pcm_s16le", 0],
		["mp3", "libmp3lame", 0],
		["m4a", "aac", 1e-4],
		["webm", "libopus", 0],
	] as const) {
		it(`places a late trim of a ${ext} source sample-accurately`, async () => {
			const file = join(dir, `tone.${ext}`);
			const enc = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", tone, "-c:a", codec, file]);
			if (enc.status !== 0) throw new Error(String(enc.stderr));
			const whole = decodeAll(file);
			const mixed = await mixAudio({
				sources: [
					{ src: file, startFrame: 3, trimBeforeFrames: 75, durationInFrames: 15, volume: 1 },
				],
				fps: 30,
				durationInFrames: 20,
				channels: 1,
			});
			const frame = 1600;
			let worst = 0;
			for (let i = 0; i < 15 * frame; i++) {
				const got = mixed.samples[3 * frame + i] ?? 0;
				worst = Math.max(worst, Math.abs(got - (whole[75 * frame + i] ?? 0)));
			}
			expect(worst).toBeLessThanOrEqual(tol);
			// Nothing before the start or after the end.
			expect(mixed.samples.subarray(0, 3 * frame).every((v) => v === 0)).toBe(true);
			expect(mixed.samples.subarray(18 * frame).every((v) => v === 0)).toBe(true);
		});
	}
});
