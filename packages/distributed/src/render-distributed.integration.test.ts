// M5 proof (D-039): a chunked render through local child-process workers against the single-node
// render of the same composition. Frame stamps show every frame exactly once across chunk
// boundaries; decoded frames are identical wherever the codec's decoded frames do not depend on
// GOP placement (ProRes is intra-only, VP9 CRF 0 is lossless); the audio is identical.
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createBundle } from "@motiojs/bundler";
import { type RenderMediaOptions, renderMedia, selectComposition } from "@motiojs/renderer";
import { type FrameStampOptions, hashFrame, probeVideo, psnr } from "@motiojs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixturePageDir } from "../../renderer/src/test-support/fixture-page.js";
import {
	decodeRgba,
	probeStream,
	stampMismatches,
} from "../../renderer/src/test-support/video-checks.js";
import { renderDistributed } from "./index.js";

const protocol = fixturePageDir();
let dir: string;
let media: string;

beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), "motio-distributed-"));
	const bundle = await createBundle({
		entryPoint: "src/index.ts",
		rootDir: resolve(import.meta.dirname, "../../../fixtures/media"),
		outDir: join(dir, "media-bundle"),
	});
	media = bundle.serveUrl;
}, 180_000);

afterAll(async () => {
	await rm(dir, { recursive: true, force: true });
});

type Codecs = Pick<RenderMediaOptions, "codec"> & Partial<RenderMediaOptions>;

/** Renders the same composition on one node and in chunks; returns both files. */
async function both(
	serveUrl: string,
	id: string,
	name: string,
	options: Codecs & { durationInFrames?: number },
	chunking: { framesPerChunk?: number; chunks?: number },
) {
	const { durationInFrames, ...render } = options;
	const composition = await selectComposition({
		serveUrl,
		id,
		inputProps: durationInFrames ? { durationInFrames } : {},
	});
	const ext = { h264: "mp4", h265: "mp4", vp9: "webm", vp8: "webm", prores: "mov" }[
		render.codec as string
	];
	const single = join(dir, `${name}-single.${ext}`);
	const chunked = join(dir, `${name}-chunked.${ext}`);
	await renderMedia({ serveUrl, composition, concurrency: 4, outputLocation: single, ...render });
	const t = performance.now();
	const result = await renderDistributed({
		serveUrl,
		composition,
		outputLocation: chunked,
		concurrency: 4,
		...chunking,
		...(render as object),
		codec: render.codec,
	});
	const seconds = (performance.now() - t) / 1000;
	return { single, chunked, composition, result, seconds };
}

async function frames(file: string): Promise<Uint8Array[]> {
	const { width, height } = await probeVideo(file);
	return decodeRgba(file, width, height, file.endsWith(".webm") ? "libvpx-vp9" : undefined);
}

/** Every sample of the first audio stream, as 32-bit floats. */
function audioSamples(file: string): Buffer {
	const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-map", "0:a:0", "-f", "f32le", "-"], {
		maxBuffer: 1 << 28,
	});
	if (r.status !== 0) throw new Error(String(r.stderr));
	return r.stdout;
}

describe("chunked render against the single-node render", () => {
	it("h264: every frame once, in order, across 37-frame chunks; PSNR to single node", async () => {
		const { single, chunked, composition, result, seconds } = await both(
			protocol,
			"stamp",
			"h264",
			{ codec: "h264", durationInFrames: 240 },
			{ framesPerChunk: 37 },
		);
		expect(result.chunks).toHaveLength(7);
		const stamp = composition.props.stamp as FrameStampOptions;
		const { frames: count, mismatches } = await stampMismatches(chunked, (i) => i, stamp);
		expect(mismatches).toEqual([]);
		expect(count).toBe(240);
		expect(
			probeStream(chunked, "v", "codec_name,pix_fmt,color_space,color_range,nb_frames"),
		).toMatchObject({
			codec_name: "h264",
			pix_fmt: "yuv420p",
			color_space: "bt709",
			color_range: "tv",
		});
		// x264 places keyframes and spends bits by GOP, so lossy chunks differ slightly from the
		// single-node encode; report how much.
		const a = await frames(single);
		const b = await frames(chunked);
		let worst = Number.POSITIVE_INFINITY;
		const { width, height } = await probeVideo(single);
		a.forEach((f, i) => {
			worst = Math.min(
				worst,
				psnr({ width, height, data: f }, { width, height, data: b[i] as Uint8Array }),
			);
		});
		console.log(
			`h264 chunked: 7 chunks in ${seconds.toFixed(1)} s, worst PSNR to single node ${worst.toFixed(2)} dB`,
		);
		expect(worst).toBeGreaterThan(40);
	});

	for (const [codec, options] of [
		["prores", { codec: "prores" }],
		["vp9 lossless", { codec: "vp9", crf: 0 }],
	] as const) {
		it(`${codec}: decoded frame hashes equal the single-node render`, async () => {
			const { single, chunked, composition } = await both(
				protocol,
				"stamp",
				codec.replace(" ", "-"),
				{ ...options, durationInFrames: 90, imageFormat: "png" },
				{ chunks: 4 },
			);
			const stamp = composition.props.stamp as FrameStampOptions;
			expect((await stampMismatches(chunked, (i) => i, stamp)).mismatches).toEqual([]);
			const a = (await frames(single)).map((f) => hashFrame(f));
			const b = (await frames(chunked)).map((f) => hashFrame(f));
			expect(b).toHaveLength(90);
			expect(b).toEqual(a);
		});
	}

	it("transparent ProRes 4444 and VP9: alpha survives assembly, frames equal single node", async () => {
		for (const [name, options] of [
			["alpha-prores", { codec: "prores", proResProfile: "4444", pixelFormat: "yuva444p10le" }],
			["alpha-vp9", { codec: "vp9", crf: 0, pixelFormat: "yuva420p" }],
		] as const) {
			const { single, chunked } = await both(
				protocol,
				"alpha-gradient",
				name,
				{ ...options, imageFormat: "png", muted: true },
				{ framesPerChunk: 7 },
			);
			const a = (await frames(single)).map((f) => hashFrame(f));
			const b = (await frames(chunked)).map((f) => hashFrame(f));
			expect(b).toHaveLength(30);
			expect(b, name).toEqual(a);
		}
	});

	it("video from a media file: the same source frames in every chunk (ProRes)", async () => {
		const { single, chunked } = await both(
			media,
			"ov-24in30",
			"ov",
			{ codec: "prores", imageFormat: "png", muted: true },
			{ framesPerChunk: 13 },
		);
		expect((await frames(chunked)).map((f) => hashFrame(f))).toEqual(
			(await frames(single)).map((f) => hashFrame(f)),
		);
	});

	for (const id of ["audio-ramp", "audio-rate2", "audio-offset"]) {
		it(`${id}: the audio equals the single-node render's, sample for sample`, async () => {
			const { single, chunked } = await both(media, id, id, { codec: "h264" }, { chunks: 3 });
			expect(probeStream(chunked, "a", "codec_name").codec_name).toBe("aac");
			const a = audioSamples(single);
			const b = audioSamples(chunked);
			expect(a.length).toBeGreaterThan(0);
			expect(b.length).toBe(a.length);
			expect(b.equals(a)).toBe(true);
		});
	}

	it("writes separateAudioTo as renderMedia does, and no audio track in the video", async () => {
		const composition = await selectComposition({ serveUrl: media, id: "audio-offset" });
		const single = join(dir, "separate-single", "audio.aac");
		const chunkedAudio = join(dir, "separate-chunked", "nested", "audio.aac");
		const chunked = join(dir, "separate-chunked.mp4");
		await renderMedia({
			serveUrl: media,
			composition,
			codec: "h264",
			outputLocation: join(dir, "separate-single.mp4"),
			separateAudioTo: single,
		});
		await renderDistributed({
			serveUrl: media,
			composition,
			codec: "h264",
			outputLocation: chunked,
			chunks: 3,
			separateAudioTo: chunkedAudio,
		});
		const a = audioSamples(single);
		expect(a.length).toBeGreaterThan(0);
		expect(audioSamples(chunkedAudio).equals(a)).toBe(true);
		expect(probeStream(chunked, "a", "codec_name")).toEqual({});
	});

	it("validates options before any chunk renders", async () => {
		const composition = await selectComposition({ serveUrl: protocol, id: "stamp" });
		const attempt = (extra: Partial<Parameters<typeof renderDistributed>[0]>) =>
			renderDistributed({
				serveUrl: protocol,
				composition,
				codec: "h264",
				outputLocation: join(dir, "never.mp4"),
				chunks: 2,
				...extra,
			});
		await expect(attempt({ codec: "gif" })).rejects.toThrow(/one palette/);
		await expect(attempt({ codec: "prores", crf: 3 })).rejects.toThrow(/no CRF/);
		await expect(attempt({ chunks: undefined })).rejects.toThrow(/exactly one/);
		await expect(attempt({ frameRange: [10, 99999] })).rejects.toThrow(/outside the composition/);
		await expect(attempt({ muted: true, separateAudioTo: join(dir, "never.aac") })).rejects.toThrow(
			/separateAudioTo/,
		);
	});
});
