import { describe, expect, it } from "vitest";
import { resolveVideoEncoding, type VideoCodec } from "./codecs.js";
import {
	assertFfmpegSupports,
	chooseVideoEncoder,
	colorFilter,
	colorTags,
	type FfmpegInfo,
	frameRateArg,
	gifEncodeArgs,
	gifPaletteArgs,
	LIBAOM_CPU_USED,
	parseCodecList,
	parseFfmpegVersion,
	parseSvtAv1Version,
	pickEncoder,
	VP8_BITRATE_CAP,
	videoArgs,
} from "./ffmpeg.js";

const info = (over: Partial<FfmpegInfo> = {}): FfmpegInfo => ({
	path: "ffmpeg",
	version: "8.1.2",
	release: [8, 1],
	encoders: new Set(["libx264"]),
	decoders: new Set(["png", "mjpeg"]),
	...over,
});

describe("ffmpeg probing", () => {
	it("parses release and git versions", () => {
		expect(parseFfmpegVersion("ffmpeg version 8.1.2 Copyright")).toEqual({
			version: "8.1.2",
			release: [8, 1],
		});
		expect(parseFfmpegVersion("ffmpeg version n7.0.1-static")).toEqual({
			version: "n7.0.1-static",
			release: [7, 0],
		});
		expect(parseFfmpegVersion("ffmpeg version N-118000-gabc")).toEqual({
			version: "N-118000-gabc",
			release: null,
		});
	});

	it("parses codec lists after the separator line", () => {
		const text = `Encoders:\n V..... = Video\n ------\n V....D libx264              libx264 H.264\n VF...D png                  PNG\n`;
		expect([...parseCodecList(text)]).toEqual(["libx264", "png"]);
	});

	it("reports old versions and missing codecs with E_FFMPEG_* codes", () => {
		const needs = { encoders: ["libx264"], decoders: ["mjpeg"] };
		expect(() => assertFfmpegSupports(info(), needs)).not.toThrow();
		expect(() => assertFfmpegSupports(info({ version: "4.3", release: [4, 3] }), needs)).toThrow(
			expect.objectContaining({ code: "E_FFMPEG_VERSION" }),
		);
		// -fps_mode, which frame extraction passes, exists since FFmpeg 5.1 (D-051).
		expect(() => assertFfmpegSupports(info({ version: "4.4.2", release: [4, 4] }), needs)).toThrow(
			expect.objectContaining({ code: "E_FFMPEG_VERSION" }),
		);
		expect(() => assertFfmpegSupports(info({ version: "5.0.3", release: [5, 0] }), needs)).toThrow(
			expect.objectContaining({ code: "E_FFMPEG_VERSION" }),
		);
		expect(() =>
			assertFfmpegSupports(info({ version: "5.1.9", release: [5, 1] }), needs),
		).not.toThrow();
		expect(() => assertFfmpegSupports(info({ encoders: new Set() }), needs)).toThrow(
			expect.objectContaining({ code: "E_FFMPEG_ENCODER_MISSING" }),
		);
		expect(() =>
			assertFfmpegSupports(info({ release: null, version: "N-1" }), needs),
		).not.toThrow();
	});

	it("accepts any one of a codec's alternative encoders and names them all when none exists", () => {
		const av1 = ["libsvtav1", "libaom-av1"] as const;
		const needs = { encoders: [av1], decoders: [] };
		const svt = info({ encoders: new Set(["libsvtav1", "libaom-av1"]) });
		const aom = info({ encoders: new Set(["libaom-av1"]) });
		expect(() => assertFfmpegSupports(aom, needs)).not.toThrow();
		expect(pickEncoder(svt, av1)).toBe("libsvtav1");
		expect(pickEncoder(aom, av1)).toBe("libaom-av1");
		let error: unknown;
		try {
			assertFfmpegSupports(info(), needs);
		} catch (e) {
			error = e;
		}
		expect(error).toMatchObject({
			code: "E_FFMPEG_ENCODER_MISSING",
			details: { encoder: "libsvtav1", alternatives: ["libsvtav1", "libaom-av1"] },
		});
		expect((error as Error).message).toContain("libsvtav1 or libaom-av1");
	});

	it("parses SVT-AV1's version line", () => {
		expect(parseSvtAv1Version("Svt[info]: SVT [version]:\tSVT-AV1 Encoder Lib v4.2.0\n")).toEqual({
			version: "4.2.0",
			major: 4,
		});
		expect(parseSvtAv1Version("nothing")).toEqual({ version: null, major: null });
	});

	it("prefers SVT-AV1 3.0 or later, then libaom, then an older SVT-AV1 (D-064)", async () => {
		const av1 = (crf?: number) => resolveVideoEncoding({ codec: "av1", imageFormat: "png", crf });
		const svt = (version: string | null) => async () => ({
			version,
			major: version === null ? null : Number(version.split(".")[0]),
		});
		const both = info({ encoders: new Set(["libsvtav1", "libaom-av1"]) });
		const svtOnly = info({ encoders: new Set(["libsvtav1"]) });
		const aomOnly = info({ encoders: new Set(["libaom-av1"]) });
		expect(await chooseVideoEncoder(both, av1(), svt("4.2.0"))).toBe("libsvtav1");
		expect(await chooseVideoEncoder(both, av1(), svt(null))).toBe("libsvtav1");
		expect(await chooseVideoEncoder(both, av1(), svt("2.3.0"))).toBe("libaom-av1");
		expect(await chooseVideoEncoder(svtOnly, av1(), svt("2.3.0"))).toBe("libsvtav1");
		await expect(chooseVideoEncoder(svtOnly, av1(0), svt("2.3.0"))).rejects.toMatchObject({
			code: "E_FFMPEG_ENCODER_MISSING",
			details: { svtAv1: "2.3.0" },
		});
		const neverProbed = async () => {
			throw new Error("probed");
		};
		expect(await chooseVideoEncoder(aomOnly, av1(0), neverProbed)).toBe("libaom-av1");
		expect(
			await chooseVideoEncoder(
				both,
				resolveVideoEncoding({ codec: "h264", imageFormat: "png" }),
				neverProbed,
			),
		).toBe("libx264");
	});
});

describe("encoder arguments", () => {
	it("formats frame rates exactly", () => {
		expect(frameRateArg(30)).toBe("30");
		expect(frameRateArg(30000 / 1001)).toBe("30000/1001");
		expect(frameRateArg(12.5)).toBe("12500/1000");
	});

	it("converts PNG frames straight to BT.709 limited range and tags them", () => {
		const f = colorFilter({ imageFormat: "png", pixelFormat: "yuv420p", colorSpace: "default" });
		expect(f).toBe(
			"scale=in_range=pc:out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv",
		);
	});

	it("converts JPEG frames from full-range BT.601 YCbCr in YUV, keeping their chroma", () => {
		const f = colorFilter({ imageFormat: "jpeg", pixelFormat: "yuv420p", colorSpace: "bt709" });
		expect(f).toBe(
			"scale=in_range=pc:out_range=pc,format=yuv420p|yuv422p|yuv444p,colorspace=all=bt709:iall=bt601-6-625:irange=pc:range=tv:fast=1,format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv",
		);
		const hdr = colorFilter({
			imageFormat: "jpeg",
			pixelFormat: "yuv420p10le",
			colorSpace: "bt2020-ncl",
		});
		expect(hdr).toContain("colorspace=all=bt2020:iall=bt601-6-625:");
		expect(hdr).toContain(",format=yuv420p10le,setparams=colorspace=bt2020nc:");
	});

	it("maps colour spaces to matrices and tags", () => {
		expect(colorTags("bt601", "yuv420p")).toMatchObject({
			matrix: "bt601",
			colorspace: "smpte170m",
		});
		expect(colorTags("bt2020-ncl", "yuv420p10le")).toMatchObject({
			colorspace: "bt2020nc",
			trc: "bt2020-10",
		});
	});

	it("builds an H.264 MP4 command with exact frame count, rate and tags", () => {
		const args = videoArgs({
			output: "/tmp/out.mp4",
			fps: 25,
			imageFormat: "jpeg",
			encoding: resolveVideoEncoding({ codec: "h264", imageFormat: "jpeg" }),
			preset: "medium",
			colorSpace: "default",
			frameCount: 50,
		});
		const after = (flag: string) => args[args.indexOf(flag) + 1];
		expect(after("-f")).toBe("image2pipe");
		expect(after("-framerate")).toBe("25");
		expect(after("-c:v")).toBe("mjpeg");
		expect(after("-crf")).toBe("18");
		expect(after("-frames:v")).toBe("50");
		expect(after("-color_range")).toBe("tv");
		expect(args.slice(-4)).toEqual(["-f", "mp4", "-y", "/tmp/out.mp4"]);
	});

	it("reads the image pipe without probing ahead, so encoding starts with the first frame", () => {
		const args = videoArgs({
			output: "/tmp/out.mp4",
			fps: 30,
			imageFormat: "png",
			encoding: resolveVideoEncoding({ codec: "h264", imageFormat: "png" }),
			preset: "medium",
			colorSpace: "default",
			frameCount: 10,
		});
		const input = args.slice(0, args.indexOf("-i"));
		expect(input.join(" ")).toContain("-probesize 32 -analyzeduration 0");
	});

	const encode = (
		codec: VideoCodec,
		extra: Parameters<typeof resolveVideoEncoding>[0] | object = {},
	) =>
		videoArgs({
			output: "/tmp/out",
			fps: 30,
			imageFormat: "png",
			encoding: resolveVideoEncoding({ codec, imageFormat: "png", ...extra }),
			preset: "veryfast",
			colorSpace: "default",
			frameCount: 10,
		}).join(" ");

	it("picks the encoder, muxer and codec settings of each codec", () => {
		expect(encode("h264-mkv")).toMatch(/-c:v libx264 -preset veryfast -crf 18 .* -f matroska/);
		expect(encode("h264-ts")).toMatch(/-f mpegts -y/);
		expect(encode("h265")).toMatch(
			/-c:v libx265 -crf 23 .*-tag:v hvc1 -movflags \+faststart -f mp4/,
		);
		expect(encode("vp8")).toContain(`-c:v libvpx -crf 9 -b:v ${VP8_BITRATE_CAP} -pix_fmt yuv420p`);
		expect(encode("vp8", { pixelFormat: "yuva420p" })).toContain(
			"-auto-alt-ref 0 -pix_fmt yuva420p",
		);
		expect(encode("vp9")).toContain("-c:v libvpx-vp9 -crf 28 -b:v 0 -pix_fmt yuv420p");
		expect(encode("vp9", { crf: 0, pixelFormat: "yuva420p" })).toContain(
			"-lossless 1 -b:v 0 -auto-alt-ref 0 -pix_fmt yuva420p",
		);
		expect(encode("prores")).toContain(
			"-c:v prores_ks -profile:v 3 -vendor apl0 -pix_fmt yuv422p10le",
		);
		expect(
			encode("prores", {
				proResProfile: "4444-xq",
				pixelFormat: "yuva444p10le",
				proResBitsPerMacroblock: 2000,
			}),
		).toContain("-profile:v 5 -vendor apl0 -bits_per_mb 2000 -pix_fmt yuva444p10le");
		expect(encode("prores")).toMatch(/-f mov -y/);
	});

	it("encodes AV1 with SVT-AV1, or libaom when chosen; CRF 0 is lossless (D-064)", () => {
		const av1 = (crf: number | undefined, encoder?: string) =>
			videoArgs({
				output: "/tmp/out.mp4",
				fps: 30,
				imageFormat: "png",
				encoding: resolveVideoEncoding({ codec: "av1", imageFormat: "png", crf }),
				preset: "medium",
				colorSpace: "default",
				frameCount: 10,
				...(encoder ? { encoder } : {}),
			}).join(" ");
		expect(av1(undefined)).toMatch(
			/-c:v libsvtav1 -crf 30 -pix_fmt yuv420p -colorspace bt709 .*-color_range tv .*-movflags \+faststart -f mp4/,
		);
		expect(av1(0)).toContain("-c:v libsvtav1 -svtav1-params lossless=1 -pix_fmt");
		expect(av1(undefined)).toContain("setparams=colorspace=bt709");
		expect(av1(40, "libaom-av1")).toContain(
			`-c:v libaom-av1 -crf 40 -b:v 0 -cpu-used ${LIBAOM_CPU_USED} -row-mt 1 -pix_fmt yuv420p`,
		);
		expect(av1(0, "libaom-av1")).toContain("-c:v libaom-av1 -crf 0 -b:v 0");
		expect(av1(undefined)).not.toContain("-tag:v");
	});

	it("writes chunks to the requested muxer", () => {
		const args = videoArgs({
			output: "/tmp/chunk.ts",
			fps: 30,
			imageFormat: "jpeg",
			encoding: resolveVideoEncoding({ codec: "h264", imageFormat: "jpeg" }),
			preset: "medium",
			colorSpace: "default",
			frameCount: 10,
			muxer: "mpegts",
		});
		expect(args).not.toContain("-movflags");
		expect(args.slice(-4)).toEqual(["-f", "mpegts", "-y", "/tmp/chunk.ts"]);
	});

	it("encodes GIFs in three passes with the D-020 palette recipe and loop values", () => {
		expect(encode("gif")).toMatch(/-c:v png -i pipe:0 -c:v copy -frames:v 10 -an -f nut/);
		expect(gifPaletteArgs("jpeg", "/tmp/p.png").join(" ")).toContain(
			"scale=in_color_matrix=bt601:in_range=pc:flags=accurate_rnd+full_chroma_int,format=rgb24,palettegen=max_colors=256:stats_mode=full",
		);
		const gif = gifEncodeArgs({
			intermediate: "/tmp/f.nut",
			palette: "/tmp/p.png",
			imageFormat: "png",
			fps: 10,
			loop: -1,
			output: "/tmp/o.gif",
		}).join(" ");
		expect(gif).toContain("[0:v]format=rgba[x];[x][1:v]paletteuse=dither=none");
		expect(gif).toContain("-r 10 -loop -1 -f gif");
	});
});
