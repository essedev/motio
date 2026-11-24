// D-037: every codec Motio encodes, through the real pipeline. Frame stamps decoded from each
// output, ffprobe checks of codec, pixel format, colour tags, frame count and the default audio
// codec of the container; alpha against the PNG frames within the D-019 bounds; GIF frame
// selection and loop counts.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeImage, type FrameStampOptions, probeVideo } from "@motiojs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RenderMediaOptions } from "./index.js";
import { renderFrames, renderMedia, selectComposition } from "./index.js";
import { fixturePageDir } from "./test-support/fixture-page.js";
import { ffmpegWithoutEncoders, systemEncoders } from "./test-support/limited-ffmpeg.js";
import {
	alphaErrors,
	decodeRgba,
	gifLoopCount,
	probeStream,
	stampMismatches,
} from "./test-support/video-checks.js";

const serveUrl = fixturePageDir();
let dir: string;
beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), "motio-codecs-"));
});
afterAll(async () => {
	await rm(dir, { recursive: true, force: true });
});

type Extra = Partial<RenderMediaOptions>;

async function render(id: string, file: string, extra: Extra & Pick<RenderMediaOptions, "codec">) {
	const composition = await selectComposition({
		serveUrl,
		id,
		inputProps: { durationInFrames: 60 },
	});
	const output = join(dir, file);
	await renderMedia({ serveUrl, composition, concurrency: 4, outputLocation: output, ...extra });
	return { output, composition };
}

/**
 * The BT.709 tags of every YUV output. ProRes is limited range by definition and FFmpeg 7 writes
 * no range into its MOV colour atom, so the range is checked for the other codecs only.
 */
function colourTags(codec: string): Record<string, string> {
	const tags: Record<string, string> = {
		color_space: "bt709",
		color_primaries: "bt709",
		color_transfer: "bt709",
	};
	if (codec !== "prores") tags.color_range = "tv";
	return tags;
}

describe("video codecs", () => {
	const cases: {
		name: string;
		file: string;
		options: Extra & Pick<RenderMediaOptions, "codec">;
		video: Record<string, string>;
		audio: string;
	}[] = [
		{
			name: "h264-mkv",
			file: "a.mkv",
			options: { codec: "h264-mkv" },
			video: { codec_name: "h264", pix_fmt: "yuv420p" },
			audio: "aac",
		},
		{
			name: "h264-ts",
			file: "a.ts",
			options: { codec: "h264-ts" },
			video: { codec_name: "h264", pix_fmt: "yuv420p" },
			audio: "aac",
		},
		{
			name: "h265",
			file: "a.mp4",
			options: { codec: "h265" },
			video: { codec_name: "hevc", pix_fmt: "yuv420p", codec_tag_string: "hvc1" },
			audio: "aac",
		},
		{
			name: "vp8",
			file: "a8.webm",
			options: { codec: "vp8" },
			video: { codec_name: "vp8", pix_fmt: "yuv420p" },
			audio: "opus",
		},
		{
			name: "vp9",
			file: "a9.webm",
			options: { codec: "vp9" },
			video: { codec_name: "vp9", pix_fmt: "yuv420p" },
			audio: "opus",
		},
		{
			name: "av1",
			file: "av1.mp4",
			options: { codec: "av1" },
			video: { codec_name: "av1", pix_fmt: "yuv420p" },
			audio: "aac",
		},
		{
			name: "av1 10-bit, JPEG capture",
			file: "av1-10.mp4",
			options: { codec: "av1", pixelFormat: "yuv420p10le", imageFormat: "jpeg" },
			video: { codec_name: "av1", pix_fmt: "yuv420p10le" },
			audio: "aac",
		},
		{
			name: "av1 lossless (CRF 0)",
			file: "av1-0.mp4",
			options: { codec: "av1", crf: 0, audioCodec: "mp3" },
			video: { codec_name: "av1", pix_fmt: "yuv420p" },
			audio: "mp3",
		},
		{
			name: "prores hq",
			file: "hq.mov",
			options: { codec: "prores" },
			video: { codec_name: "prores", pix_fmt: "yuv422p10le", profile: "HQ" },
			audio: "pcm_s16le",
		},
		{
			name: "prores 4444 (opaque)",
			file: "4444.mov",
			options: { codec: "prores", proResProfile: "4444" },
			// FFmpeg's ProRes decoder reports 4444 streams as 12-bit.
			video: { codec_name: "prores", pix_fmt: "yuv444p12le", profile: "4444" },
			audio: "pcm_s16le",
		},
		{
			name: "prores proxy, JPEG capture",
			file: "proxy.mov",
			options: { codec: "prores", proResProfile: "proxy", imageFormat: "jpeg" },
			video: { codec_name: "prores", pix_fmt: "yuv422p10le", profile: "Proxy" },
			audio: "pcm_s16le",
		},
	];
	for (const c of cases) {
		it(`${c.name}: every frame stamp, codec, pixel format, colour tags and default audio`, async () => {
			const { output, composition } = await render("stamp", c.file, {
				imageFormat: "png",
				enforceAudioTrack: true,
				...c.options,
			});
			const { frames, mismatches } = await stampMismatches(
				output,
				(i) => i,
				composition.props.stamp as FrameStampOptions,
			);
			expect(mismatches).toEqual([]);
			expect(frames).toBe(60);
			expect(
				probeStream(
					output,
					"v",
					"codec_name,pix_fmt,profile,codec_tag_string,color_space,color_primaries,color_transfer,color_range",
				),
			).toMatchObject({ ...c.video, ...colourTags(c.options.codec) });
			expect(probeStream(output, "a", "codec_name").codec_name).toBe(c.audio);
			const probe = await probeVideo(output);
			expect(probe.frameCount).toBe(60);
			expect(probe.fps).toBeCloseTo(30, 6);
		});
	}

	it("rejects options a codec does not take, before rendering", async () => {
		const composition = await selectComposition({ serveUrl, id: "stamp" });
		const attempt = (extra: Extra & Pick<RenderMediaOptions, "codec">) =>
			renderMedia({ serveUrl, composition, outputLocation: join(dir, "never"), ...extra });
		await expect(attempt({ codec: "prores", crf: 10 })).rejects.toMatchObject({
			code: "E_INVALID_OPTION",
		});
		await expect(attempt({ codec: "vp9", pixelFormat: "yuva420p" })).rejects.toThrow(
			/needs imageFormat "png"/,
		);
		await expect(attempt({ codec: "h264", proResProfile: "hq" })).rejects.toThrow(
			/only valid with the codec "prores"/,
		);
		await expect(attempt({ codec: "vp9", audioCodec: "aac" })).rejects.toThrow(
			/cannot be used with codec "vp9"/,
		);
		await expect(attempt({ codec: "vp9", sampleRate: 44100 })).rejects.toThrow(/opus/);
		await expect(attempt({ codec: "gif", separateAudioTo: join(dir, "x.aac") })).rejects.toThrow(
			/separateAudioTo/,
		);
		await expect(attempt({ codec: "av1", pixelFormat: "yuv444p" })).rejects.toThrow(
			/cannot be used with av1/,
		);
		await expect(attempt({ codec: "av1", audioCodec: "opus" })).rejects.toThrow(
			/cannot be used with codec "av1"/,
		);
	});

	it("writes the container the output's extension names, and rejects the others", async () => {
		const format = (file: string) => {
			const r = spawnSync(
				"ffprobe",
				[
					"-v",
					"error",
					"-show_entries",
					"format=format_name:format_tags=major_brand",
					"-of",
					"json",
					file,
				],
				{ encoding: "utf8" },
			);
			const f = (
				JSON.parse(r.stdout) as { format: { format_name: string; tags?: Record<string, string> } }
			).format;
			return `${f.format_name} ${f.tags?.major_brand?.trim() ?? ""}`.trim();
		};
		const cases = [
			{ codec: "h264", file: "x.mov", expected: "mov,mp4,m4a,3gp,3g2,mj2 qt" },
			{ codec: "h264", file: "x.MKV", expected: "matroska,webm" },
			{ codec: "prores", file: "x-prores.mkv", expected: "matroska,webm" },
			{ codec: "aac", file: "x.m4a", expected: "mov,mp4,m4a,3gp,3g2,mj2 M4A" },
		] as const;
		for (const c of cases) {
			const { output } = await render("stamp", c.file, { codec: c.codec, frameRange: [0, 9] });
			expect({ file: c.file, format: format(output) }).toEqual({
				file: c.file,
				format: c.expected,
			});
		}
		const composition = await selectComposition({ serveUrl, id: "stamp" });
		await expect(
			renderMedia({ serveUrl, composition, codec: "vp9", outputLocation: join(dir, "intro.mp4") }),
		).rejects.toThrow(/does not fit the codec vp9 with opus audio, which is written to \.webm/);
		expect(existsSync(join(dir, "intro.mp4"))).toBe(false);
	});
});

describe("AV1 encoders (D-064)", () => {
	it("fails before rendering when FFmpeg has neither SVT-AV1 nor libaom, naming both", async () => {
		const composition = await selectComposition({ serveUrl, id: "stamp" });
		const ffmpeg = ffmpegWithoutEncoders(dir, ["libsvtav1", "libaom-av1"]);
		const started = performance.now();
		await expect(
			renderMedia({
				serveUrl,
				composition,
				codec: "av1",
				outputLocation: join(dir, "never.mp4"),
				ffmpegExecutable: ffmpeg,
			}),
		).rejects.toMatchObject({
			code: "E_FFMPEG_ENCODER_MISSING",
			message: expect.stringContaining("libsvtav1 or libaom-av1"),
		});
		expect(performance.now() - started).toBeLessThan(10_000);
	});

	it.skipIf(!systemEncoders().has("libaom-av1"))(
		"falls back to libaom when SVT-AV1 is missing",
		async () => {
			const ffmpeg = ffmpegWithoutEncoders(dir, ["libsvtav1"]);
			const { output, composition } = await render("stamp", "aom.mp4", {
				codec: "av1",
				frameRange: [0, 14],
				muted: true,
				ffmpegExecutable: ffmpeg,
			});
			const { frames, mismatches } = await stampMismatches(
				output,
				(i) => i,
				composition.props.stamp as FrameStampOptions,
			);
			expect(mismatches).toEqual([]);
			expect(frames).toBe(15);
			expect(probeStream(output, "v", "codec_name").codec_name).toBe("av1");
		},
	);
});

describe("GIF", () => {
	it("keeps every nth frame at fps / n, with the palette recipe", async () => {
		const { output, composition } = await render("stamp", "nth.gif", {
			codec: "gif",
			everyNthFrame: 3,
			frameRange: [0, 59],
		});
		const { frames, mismatches } = await stampMismatches(
			output,
			(i) => i * 3,
			composition.props.stamp as FrameStampOptions,
		);
		expect(mismatches).toEqual([]);
		expect(frames).toBe(20);
		expect(probeStream(output, "v", "codec_name").codec_name).toBe("gif");
		expect((await probeVideo(output)).fps).toBeCloseTo(10, 6);
		// Loops forever by default.
		expect(gifLoopCount(readFileSync(output))).toBe(0);
	});

	it("reports progress through the capture, the palette pass and the encode pass", async () => {
		const composition = await selectComposition({
			serveUrl,
			id: "stamp",
			inputProps: { durationInFrames: 300 },
		});
		const reports: { rendered: number; encoded: number; progress: number }[] = [];
		await renderMedia({
			serveUrl,
			composition,
			codec: "gif",
			concurrency: 4,
			outputLocation: join(dir, "progress.gif"),
			onProgress: (p) =>
				reports.push({
					rendered: p.renderedFrames,
					encoded: p.encodedFrames,
					progress: p.progress,
				}),
		});
		const progress = reports.map((r) => r.progress);
		for (let i = 1; i < reports.length; i++) {
			const [before, after] = [reports[i - 1], reports[i]] as [
				(typeof reports)[0],
				(typeof reports)[0],
			];
			expect(after.progress).toBeGreaterThanOrEqual(before.progress);
			expect(after.rendered).toBeGreaterThanOrEqual(before.rendered);
			expect(after.encoded).toBeGreaterThanOrEqual(before.encoded);
		}
		// Capture: one third, rendered frames only (the GIF is not encoded yet).
		expect(progress.some((p) => p > 0 && p < 1 / 3)).toBe(true);
		expect(reports.filter((r) => r.progress <= 1 / 3).every((r) => r.encoded === 0)).toBe(true);
		// Palette pass: the second third moves while FFmpeg reads the clip, before any GIF frame.
		const palette = reports.filter((r) => r.progress > 1 / 3 + 1e-9 && r.progress < 2 / 3 - 1e-9);
		expect(palette.length).toBeGreaterThan(2);
		expect(palette.every((r) => r.rendered === 300 && r.encoded === 0)).toBe(true);
		expect(progress.some((p) => Math.abs(p - 2 / 3) < 1e-9)).toBe(true);
		// Encode pass: the last third counts GIF frames, to 1.
		expect(reports.at(-1)).toEqual({ rendered: 300, encoded: 300, progress: 1 });
		expect(reports.filter((r) => r.progress < 1).every((r) => r.encoded < 300)).toBe(true);
	}, 60_000);

	it("writes numberOfGifLoops into the NETSCAPE extension (D-020)", async () => {
		for (const [loops, expected] of [
			[0, null],
			[2, 2],
		] as const) {
			const { output } = await render("stamp", `loops-${loops}.gif`, {
				codec: "gif",
				frameRange: [0, 4],
				numberOfGifLoops: loops,
			});
			expect(gifLoopCount(readFileSync(output))).toBe(expected);
		}
	});

	it("is transparent with PNG capture", async () => {
		const { output } = await render("alpha-gradient", "alpha.gif", {
			codec: "gif",
			imageFormat: "png",
			frameRange: [0, 2],
		});
		const frames = await decodeRgba(output, 448, 128);
		expect(frames).toHaveLength(3);
		const first = frames[0] as Uint8Array;
		// The transparent background (left of the red ramp is alpha 0) stays transparent.
		expect(first[(127 * 448 + 400) * 4 + 3]).toBe(0);
		// The opaque stamp background stays opaque.
		expect(first[(10 * 448 + 10) * 4 + 3]).toBe(255);
	});
});

describe("alpha (D-019 bounds against the PNG frames)", () => {
	let reference: Uint8Array[] = [];
	beforeAll(async () => {
		const composition = await selectComposition({ serveUrl, id: "alpha-gradient" });
		const images = new Map<number, Buffer>();
		await renderFrames({
			serveUrl,
			composition,
			outputDir: null,
			imageFormat: "png",
			onFrameBuffer: (b, f) => {
				images.set(f, b);
			},
		});
		reference = [];
		for (let f = 0; f < composition.durationInFrames; f++) {
			reference.push((await decodeImage(images.get(f) as Buffer)).data);
		}
	});

	// Lossless recipes: alpha and opaque colour within 1 everywhere (4:2:0 away from chroma
	// edges). Lossy recipes (D-037): alpha on the ramp (rows 64 to 95, the smooth signal D-019
	// measured) within the D-019 bound for the CRF; over the whole frame, where the moving box's
	// hard alpha edges ring, within the bound measured on this fixture.
	const RAMP = [64, 96] as const;
	const cases: {
		name: string;
		file: string;
		options: Extra & Pick<RenderMediaOptions, "codec">;
		decoder?: string;
		pixFmt: string;
		margin: number;
		maxAlpha: number;
		maxRampAlpha: number;
		maxColour: number;
	}[] = [
		{
			name: "ProRes 4444",
			file: "a4444.mov",
			options: { codec: "prores", proResProfile: "4444", pixelFormat: "yuva444p10le" },
			pixFmt: "yuva444p12le",
			margin: 0,
			maxAlpha: 1,
			maxRampAlpha: 1,
			maxColour: 1,
		},
		{
			name: "ProRes 4444 XQ",
			file: "axq.mov",
			options: { codec: "prores", proResProfile: "4444-xq", pixelFormat: "yuva444p10le" },
			pixFmt: "yuva444p12le",
			margin: 0,
			maxAlpha: 1,
			maxRampAlpha: 1,
			maxColour: 1,
		},
		{
			name: "VP9 lossless (crf 0)",
			file: "a9l.webm",
			options: { codec: "vp9", crf: 0, pixelFormat: "yuva420p" },
			decoder: "libvpx-vp9",
			pixFmt: "yuva420p",
			margin: 2,
			maxAlpha: 1,
			maxRampAlpha: 1,
			maxColour: 1,
		},
		{
			name: "VP9 crf 4",
			file: "a94.webm",
			options: { codec: "vp9", crf: 4, pixelFormat: "yuva420p" },
			decoder: "libvpx-vp9",
			pixFmt: "yuva420p",
			margin: 2,
			maxAlpha: 4,
			maxRampAlpha: 2,
			maxColour: 1,
		},
		{
			name: "VP9 crf 20",
			file: "a920.webm",
			options: { codec: "vp9", crf: 20, pixelFormat: "yuva420p" },
			decoder: "libvpx-vp9",
			pixFmt: "yuva420p",
			margin: 2,
			maxAlpha: 18,
			maxRampAlpha: 7,
			maxColour: 1,
		},
		{
			name: "VP9 crf 31",
			file: "a931.webm",
			options: { codec: "vp9", crf: 31, pixelFormat: "yuva420p" },
			decoder: "libvpx-vp9",
			pixFmt: "yuva420p",
			margin: 2,
			maxAlpha: 20,
			maxRampAlpha: 12,
			maxColour: 1,
		},
		{
			name: "VP8 (default crf 9)",
			file: "a8.webm",
			options: { codec: "vp8", pixelFormat: "yuva420p" },
			decoder: "libvpx",
			pixFmt: "yuva420p",
			margin: 2,
			maxAlpha: 4,
			maxRampAlpha: 3,
			maxColour: 1,
		},
	];
	for (const c of cases) {
		it(`${c.name}: alpha within ${c.maxAlpha} (ramp ${c.maxRampAlpha}), opaque colour within ${c.maxColour}`, async () => {
			const { output } = await render("alpha-gradient", c.file, {
				imageFormat: "png",
				muted: true,
				...c.options,
			});
			// Matroska stores the alpha plane on the side; ffprobe reports it as a tag.
			const probe = probeStream(output, "v", "codec_name,pix_fmt:stream_tags=alpha_mode");
			if (c.decoder) expect(probe).toMatchObject({ tags: { alpha_mode: "1" } });
			else expect(probe.pix_fmt).toBe(c.pixFmt);
			const decoded = await decodeRgba(output, 448, 128, c.decoder);
			expect(decoded).toHaveLength(reference.length);
			const worst = { alpha: 0, ramp: 0, colour: 0 };
			decoded.forEach((frame, i) => {
				const ref = reference[i] as Uint8Array;
				const e = alphaErrors(ref, frame, 448, { margin: c.margin });
				worst.alpha = Math.max(worst.alpha, e.alpha);
				worst.colour = Math.max(worst.colour, e.colour);
				worst.ramp = Math.max(worst.ramp, alphaErrors(ref, frame, 448, { rows: RAMP }).alpha);
			});
			console.log(
				`${c.name}: max alpha error ${worst.alpha} (ramp ${worst.ramp}), max opaque colour error ${worst.colour}`,
			);
			expect(worst.ramp).toBeLessThanOrEqual(c.maxRampAlpha);
			expect(worst.alpha).toBeLessThanOrEqual(c.maxAlpha);
			expect(worst.colour).toBeLessThanOrEqual(c.maxColour);
		});
	}
});
