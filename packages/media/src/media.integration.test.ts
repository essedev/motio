// M3 proof for media: every composition of fixtures/media, written against the Remotion API,
// bundled through the compat alias and rendered by the real pipeline. Video: the frame stamps
// decoded from the output equal Remotion's recording (OffthreadVideo, @remotion/media Video) or
// the `nearest` rule (HTML5 Video, D-015, D-016). Audio: click times and peaks against
// fixtures/media/__golden__/remotion/media.json, with the volume-lag window of D-014.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createBundle } from "@motiojs/bundler";
import {
	renderFrames,
	renderMedia,
	selectComposition,
	stitchFramesToVideo,
} from "@motiojs/renderer";
import { decodeFrameStamp, decodeVideoFrames } from "@motiojs/testing";
import { probeVideo, selectFrame } from "@motiojs/video-frames";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const FIXTURE = resolve(import.meta.dirname, "../../../fixtures/media");
const golden = JSON.parse(
	readFileSync(join(FIXTURE, "__golden__/remotion/media.json"), "utf8"),
) as {
	video: Record<string, (number | null)[]>;
	audio: Record<string, { t: number; peak: number }[]>;
};
const STAMP = { x: 48, y: 127, blockSize: 16 } as const;

let outDir: string;
let serveUrl: string;

beforeAll(async () => {
	outDir = await mkdtemp(join(tmpdir(), "motio-media-"));
	const bundle = await createBundle({
		entryPoint: "src/index.ts",
		rootDir: FIXTURE,
		outDir: join(outDir, "bundle"),
	});
	serveUrl = bundle.serveUrl;
}, 120_000);

afterAll(async () => {
	if (outDir) await rm(outDir, { recursive: true, force: true });
});

async function stamps(file: string): Promise<(number | null)[]> {
	const out: (number | null)[] = [];
	for await (const f of decodeVideoFrames(file)) {
		const r = decodeFrameStamp(f.data, f.width, f.height, STAMP);
		out.push(r.ok ? r.frame : null);
	}
	return out;
}

async function renderVideo(id: string, concurrency = 4): Promise<(number | null)[]> {
	const composition = await selectComposition({ serveUrl, id, inputProps: {} });
	const output = join(outDir, `${id}.mp4`);
	await renderMedia({
		serveUrl,
		composition,
		codec: "h264",
		imageFormat: "png",
		crf: 1,
		concurrency,
		muted: true,
		outputLocation: output,
	});
	return stamps(output);
}

describe("video compositions show the exact source frames", () => {
	const exact = [
		"ov-24in30",
		"ov-30in60",
		"ov-5994in30",
		"ov-60in30",
		"ov-rate2",
		"ov-trim",
		"media-24in30",
	];
	for (const id of exact) {
		it(`${id} equals Remotion's recording`, async () => {
			expect(await renderVideo(id)).toEqual(golden.video[id]);
		});
	}

	it("html5-24in30 equals the nearest rule (D-015, D-016)", async () => {
		const { timestamps } = await probeVideo(join(FIXTURE, "public/stamp-24.mp4"));
		const expected = Array.from({ length: 60 }, (_, f) =>
			selectFrame(timestamps, f / 30, "nearest"),
		);
		const got = await renderVideo("html5-24in30");
		expect(got).toEqual(expected);
		const agree = got.filter((v, i) => v === golden.video["html5-24in30"]?.[i]).length;
		console.log(`html5-24in30: agrees with Remotion's (inconsistent) recording on ${agree} of 60`);
	});
});

/** Same detector as tools/oracle-render/record-media.ts: mono, 48 kHz. */
function clicks(file: string, stream = "a:0"): { t: number; peak: number }[] {
	const r = spawnSync(
		"ffmpeg",
		[
			"-loglevel",
			"error",
			"-i",
			file,
			"-map",
			`0:${stream}`,
			"-ac",
			"1",
			"-ar",
			"48000",
			"-f",
			"f32le",
			"-",
		],
		{ maxBuffer: 1 << 28 },
	);
	if (r.status !== 0) throw new Error(`decoding ${file} failed: ${r.stderr}`);
	const s = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4);
	const out: { t: number; peak: number }[] = [];
	let quiet = 1000;
	for (let i = 0; i < s.length; i++) {
		const a = Math.abs(s[i] ?? 0);
		if (a > 0.02 && quiet >= 96) {
			let peak = 0;
			for (let j = i; j < Math.min(s.length, i + 48); j++)
				peak = Math.max(peak, Math.abs(s[j] ?? 0));
			out.push({ t: i / 48000, peak });
		}
		quiet = a > 0.02 ? 0 : quiet + 1;
	}
	return out;
}

/** The first audio stream of `file`, downmixed to mono at 48 kHz. */
function mono(file: string): Float32Array {
	const r = spawnSync(
		"ffmpeg",
		[
			"-loglevel",
			"error",
			"-i",
			file,
			"-map",
			"0:a:0",
			"-ac",
			"1",
			"-ar",
			"48000",
			"-f",
			"f32le",
			"-",
		],
		{ maxBuffer: 1 << 28 },
	);
	if (r.status !== 0) throw new Error(`decoding ${file} failed: ${r.stderr}`);
	const out = new Float32Array(r.stdout.length / 4);
	new Uint8Array(out.buffer).set(r.stdout.subarray(0, out.length * 4));
	return out;
}

/** The shift of `b` against `a`, in samples within `maxLag`, that correlates best. */
function bestLag(a: Float32Array, b: Float32Array, maxLag: number): number {
	let best = 0;
	let bestScore = Number.NEGATIVE_INFINITY;
	const n = Math.min(a.length, b.length);
	for (let lag = -maxLag; lag <= maxLag; lag++) {
		let score = 0;
		for (let i = Math.max(0, -lag); i < n - Math.max(0, lag); i++) {
			score += (a[i] ?? 0) * (b[i + lag] ?? 0);
		}
		if (score > bestScore) {
			bestScore = score;
			best = lag;
		}
	}
	return best;
}

/**
 * Remotion applies volume changes about 1.5 frames late (up to 2.5 on the ramp, D-014); Motio
 * applies them on time. Clicks in this window after a volume change are not compared for peak.
 */
const LAG_WINDOW_S = 3 / 30;

async function renderAudio(
	id: string,
	extra: Partial<Parameters<typeof renderMedia>[0]> = {},
): Promise<string> {
	const composition = await selectComposition({ serveUrl, id, inputProps: {} });
	const output = join(
		outDir,
		`${id}-${Object.keys(extra).join("-") || "wav"}.${extra.codec === "h264" ? "mp4" : "wav"}`,
	);
	await renderMedia({
		serveUrl,
		composition,
		codec: "wav",
		concurrency: 4,
		outputLocation: output,
		...extra,
	});
	return output;
}

function compare(
	got: { t: number; peak: number }[],
	want: { t: number; peak: number }[],
	tTol: number,
	lag: (t: number) => boolean,
): { maxDt: number; maxDpeak: number } {
	expect(got.length).toBe(want.length);
	let maxDt = 0;
	let maxDpeak = 0;
	got.forEach((g, i) => {
		const w = want[i] as { t: number; peak: number };
		const dt = Math.abs(g.t - w.t);
		maxDt = Math.max(maxDt, dt);
		expect(dt).toBeLessThanOrEqual(tTol);
		if (!lag(g.t)) {
			const dp = Math.abs(g.peak - w.peak);
			maxDpeak = Math.max(maxDpeak, dp);
			expect(dp).toBeLessThanOrEqual(0.01);
		}
	});
	return { maxDt, maxDpeak };
}

describe("audio compositions match Remotion's clicks", () => {
	const cases: { id: string; lag: (t: number) => boolean }[] = [
		{ id: "audio-offset", lag: () => false },
		{ id: "audio-vol25", lag: () => false },
		{ id: "audio-vol50", lag: () => false },
		// The step from 0.2 to 0.8 at frame 30 (1 s).
		{ id: "audio-step", lag: (t) => t >= 1 && t < 1 + LAG_WINDOW_S },
		// The ramp changes the volume on every frame up to frame 60 (2 s).
		{ id: "audio-ramp", lag: (t) => t < 2 + LAG_WINDOW_S },
		// Two copies of one source at different offsets and volumes.
		{ id: "audio-overlap", lag: () => false },
		// A trimmed source restarted by a Loop every 20 frames.
		{ id: "audio-loop", lag: () => false },
	];
	for (const c of cases) {
		it(`${c.id}: click times within 1 ms, peaks within 0.01`, async () => {
			const got = clicks(await renderAudio(c.id));
			const r = compare(got, golden.audio[c.id] ?? [], 0.001, c.lag);
			console.log(
				`${c.id}: max |dt| ${(r.maxDt * 1000).toFixed(3)} ms, max |dpeak| ${r.maxDpeak.toFixed(4)}`,
			);
		});
	}

	it("audio-rate2: time-stretched clicks within 2 ms", async () => {
		const got = clicks(await renderAudio("audio-rate2"));
		const want = golden.audio["audio-rate2"] ?? [];
		const errors = want.map((w) => Math.min(...got.map((g) => Math.abs(g.t - w.t))));
		console.log(`audio-rate2: max |dt| ${(Math.max(...errors) * 1000).toFixed(3)} ms`);
		expect(Math.max(...errors)).toBeLessThanOrEqual(0.002);
	});

	it("muxes AAC into the MP4 aligned with the WAV render within 1 ms", async () => {
		const wav = await renderAudio("audio-offset");
		const mp4 = await renderAudio("audio-offset", { codec: "h264" });
		// AAC smears each 1 ms click (pre-echo), which moves a threshold detector by up to 1.5 ms;
		// the alignment of the muxed track is measured by cross-correlation instead.
		const lag = bestLag(mono(wav), mono(mp4), 480);
		console.log(
			`audio-offset in MP4/AAC: offset ${lag} samples (${((lag / 48) as number).toFixed(3)} ms)`,
		);
		expect(Math.abs(lag)).toBeLessThanOrEqual(48);
		expect(clicks(mp4).length).toBe(golden.audio["audio-offset"]?.length);
	});

	it("keeps every click with everyNthFrame (the audio pass visits skipped frames)", async () => {
		const wav = await renderAudio("audio-offset");
		const mp4 = await renderAudio("audio-offset", { codec: "h264", everyNthFrame: 3 });
		expect(clicks(mp4).length).toBe(golden.audio["audio-offset"]?.length);
		expect(Math.abs(bestLag(mono(wav), mono(mp4), 480))).toBeLessThanOrEqual(48);
	});

	it("renders the audio of a frame range, shifted to the range start", async () => {
		const out = await renderAudio("audio-offset", { frameRange: [30, 89] });
		const got = clicks(out);
		const want = (golden.audio["audio-offset"] ?? []).filter((w) => w.t >= 1).map((w) => w.t - 1);
		expect(got.map((g) => Math.round(g.t * 1000))).toEqual(want.map((t) => Math.round(t * 1000)));
	});

	it("writes no audio track when muted", async () => {
		const out = await renderAudio("audio-offset", { codec: "h264", muted: true });
		const probe = spawnSync(
			"ffprobe",
			["-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", out],
			{
				encoding: "utf8",
			},
		);
		expect(probe.stdout.trim().split("\n")).toEqual(["video"]);
	});
});

describe("audio segments join without seams", () => {
	// fixtures/media/public/tone.wav is a 997 Hz sine at 0.4: a gap, a repeated sample or a fade
	// where segments join shows as an error against the exact signal built from the source.
	const frame = 48000 / 30;
	let tone = new Float32Array(0);
	beforeAll(() => {
		tone = mono(join(FIXTURE, "public/tone.wav"));
	});
	const cases: { id: string; expected: (n: number) => number; joins: number[] }[] = [
		{
			id: "audio-overlap",
			expected: (n) => (tone[n] ?? 0) + (n >= 4 * frame ? 0.6 * (tone[n - 4 * frame] ?? 0) : 0),
			joins: [4 * frame],
		},
		{
			id: "audio-loop",
			expected: (n) => tone[3 * frame + (n % (20 * frame))] ?? 0,
			joins: [20 * frame, 40 * frame],
		},
	];
	for (const c of cases) {
		it(`${c.id}: every sample equals the source placed exactly`, async () => {
			const inputProps = { src: "tone.wav" };
			const composition = await selectComposition({ serveUrl, id: c.id, inputProps });
			const output = join(outDir, `${c.id}-tone.wav`);
			await renderMedia({
				serveUrl,
				composition,
				codec: "wav",
				concurrency: 4,
				inputProps,
				outputLocation: output,
			});
			const got = mono(output);
			expect(got.length).toBe(composition.durationInFrames * frame);
			let worst = 0;
			let worstAt = -1;
			for (let n = 0; n < got.length; n++) {
				const e = Math.abs((got[n] ?? 0) - c.expected(n));
				if (e > worst) {
					worst = e;
					worstAt = n;
				}
			}
			const nearJoin = Math.min(...c.joins.map((j) => Math.abs(worstAt - j)));
			console.log(
				`${c.id} with a tone: max error ${worst.toExponential(2)} at sample ${worstAt} (${nearJoin} from a join)`,
			);
			// 16-bit output: a few quantisation steps; one sample of slip on the tone is about 0.05.
			expect(worst).toBeLessThan(2e-4);
		});
	}
});

/** Every sample of the first audio stream, as 32-bit floats. */
function audioSamples(file: string): Buffer {
	const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-map", "0:a:0", "-f", "f32le", "-"], {
		maxBuffer: 1 << 28,
	});
	if (r.status !== 0) throw new Error(String(r.stderr));
	return r.stdout;
}

describe("stitchFramesToVideo", () => {
	for (const frameRange of [null, [30, 89] as [number, number]]) {
		it(`muxes the audio renderMedia muxes (frame range ${JSON.stringify(frameRange)})`, async () => {
			const id = "audio-offset";
			const composition = await selectComposition({ serveUrl, id, inputProps: {} });
			const name = `stitch-${frameRange ? "range" : "full"}`;
			const direct = join(outDir, `${name}-direct.mp4`);
			await renderMedia({
				serveUrl,
				composition,
				codec: "h264",
				frameRange,
				outputLocation: direct,
			});
			const { assetsInfo } = await renderFrames({
				serveUrl,
				composition,
				outputDir: join(outDir, `${name}-frames`),
				frameRange,
			});
			const stitched = join(outDir, `${name}-stitched.mp4`);
			const encoded: number[] = [];
			const result = await stitchFramesToVideo({
				fps: composition.fps,
				width: composition.width,
				height: composition.height,
				assetsInfo,
				outputLocation: stitched,
				onProgress: (n) => encoded.push(n),
			});
			expect(result).toBeNull();
			expect(encoded.at(-1)).toBe(assetsInfo.frames.length);
			expect((await probeVideo(stitched)).timestamps).toHaveLength(assetsInfo.frames.length);
			const a = audioSamples(direct);
			const b = audioSamples(stitched);
			expect(a.length).toBeGreaterThan(0);
			expect(b.equals(a)).toBe(true);
		});
	}
});
