// Mixes the audio compositions of fixtures/media with hand-written sources and compares click
// times and peaks with the Remotion recordings in fixtures/media/__golden__/remotion/media.json.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
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
