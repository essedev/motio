import { describe, expect, it } from "vitest";
import {
	assertFfmpegSupports,
	colorFilter,
	colorTags,
	type FfmpegInfo,
	frameRateArg,
	h264Args,
	parseCodecList,
	parseFfmpegVersion,
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
		expect(() => assertFfmpegSupports(info({ encoders: new Set() }), needs)).toThrow(
			expect.objectContaining({ code: "E_FFMPEG_ENCODER_MISSING" }),
		);
		expect(() =>
			assertFfmpegSupports(info({ release: null, version: "N-1" }), needs),
		).not.toThrow();
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

	it("decodes JPEG frames as full-range BT.601 before converting", () => {
		const f = colorFilter({ imageFormat: "jpeg", pixelFormat: "yuv420p", colorSpace: "bt709" });
		expect(f.startsWith("scale=in_color_matrix=bt601:in_range=pc:")).toBe(true);
		expect(f).toContain("format=gbrp16le,scale=in_range=pc:out_color_matrix=bt709:out_range=tv");
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
		const args = h264Args({
			output: "/tmp/out.mp4",
			fps: 25,
			imageFormat: "jpeg",
			crf: 18,
			preset: "medium",
			pixelFormat: "yuv420p",
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
		expect(args.at(-1)).toBe("/tmp/out.mp4");
	});
});
