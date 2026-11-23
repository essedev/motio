import { describe, expect, it } from "vitest";
import { supportedAudioCodecs } from "./audio-options.js";
import { resolveVideoEncoding } from "./codecs.js";

const code = (c: string) => expect.objectContaining({ code: c });

describe("resolveVideoEncoding", () => {
	it("applies the CRF range and default of each codec", () => {
		const crf = (codec: Parameters<typeof resolveVideoEncoding>[0]["codec"], value?: number) =>
			resolveVideoEncoding({ codec, imageFormat: "jpeg", crf: value }).crf;
		expect([crf("h264"), crf("h265"), crf("vp8"), crf("vp9")]).toEqual([18, 23, 9, 28]);
		expect([crf("h265", 0), crf("vp8", 4), crf("vp9", 63), crf("h264-ts", 51)]).toEqual([
			0, 4, 63, 51,
		]);
		for (const [codec, value] of [
			["h264", 0],
			["h264", 52],
			["h265", 52],
			["vp8", 3],
			["vp9", 64],
			["vp9", 1.5],
		] as const) {
			expect(() => crf(codec, value)).toThrow(code("E_INVALID_OPTION"));
		}
	});

	it("validates AV1: CRF 0 to 63, default 30, 4:2:0 only, no alpha (D-064)", () => {
		const av1 = (extra: object = {}) =>
			resolveVideoEncoding({ codec: "av1", imageFormat: "jpeg", ...extra });
		expect(av1()).toMatchObject({ crf: 30, pixelFormat: "yuv420p", alpha: false });
		expect([av1({ crf: 0 }).crf, av1({ crf: 63 }).crf]).toEqual([0, 63]);
		expect(av1({ pixelFormat: "yuv420p10le" }).pixelFormat).toBe("yuv420p10le");
		expect(() => av1({ crf: 64 })).toThrow(code("E_INVALID_OPTION"));
		expect(() => av1({ crf: -1 })).toThrow(code("E_INVALID_OPTION"));
		expect(() => av1({ pixelFormat: "yuv444p" })).toThrow(/cannot be used with av1/);
		expect(() =>
			resolveVideoEncoding({ codec: "av1", imageFormat: "png", pixelFormat: "yuva420p" }),
		).toThrow(/alpha channel, which av1 cannot store/);
	});

	it("rejects a CRF for ProRes and GIF", () => {
		expect(() => resolveVideoEncoding({ codec: "prores", imageFormat: "jpeg", crf: 10 })).toThrow(
			/no CRF option/,
		);
		expect(() => resolveVideoEncoding({ codec: "gif", imageFormat: "jpeg", crf: 10 })).toThrow(
			code("E_INVALID_OPTION"),
		);
	});

	it("resolves the ProRes profile and its pixel formats", () => {
		const prores = (extra: object) =>
			resolveVideoEncoding({ codec: "prores", imageFormat: "png", ...extra });
		expect(prores({})).toMatchObject({
			proResProfile: "hq",
			pixelFormat: "yuv422p10le",
			alpha: false,
		});
		expect(prores({ defaultProResProfile: "proxy" }).proResProfile).toBe("proxy");
		expect(prores({ proResProfile: "4444" })).toMatchObject({
			pixelFormat: "yuv444p10le",
			alpha: false,
		});
		expect(prores({ proResProfile: "4444-xq", pixelFormat: "yuva444p10le" })).toMatchObject({
			alpha: true,
		});
		expect(() => prores({ pixelFormat: "yuva444p10le" })).toThrow(
			/needs the ProRes profile "4444"/,
		);
		expect(() => prores({ proResProfile: "best" })).toThrow(/proResProfile must be one of/);
		expect(() => prores({ pixelFormat: "yuv420p" })).toThrow(/cannot be used with prores/);
		expect(() => prores({ proResBitsPerMacroblock: 64 })).toThrow(/128 to 8192/);
		expect(() =>
			resolveVideoEncoding({ codec: "h264", imageFormat: "jpeg", proResProfile: "hq" }),
		).toThrow(/only valid with the codec "prores"/);
		expect(() =>
			resolveVideoEncoding({ codec: "vp9", imageFormat: "jpeg", proResBitsPerMacroblock: 200 }),
		).toThrow(/only valid with the codec "prores"/);
	});

	it("keeps alpha only where the codec stores it, and only from PNG", () => {
		expect(
			resolveVideoEncoding({ codec: "vp8", imageFormat: "png", pixelFormat: "yuva420p" }).alpha,
		).toBe(true);
		expect(
			resolveVideoEncoding({ codec: "vp9", imageFormat: "png", pixelFormat: "yuva420p" }).alpha,
		).toBe(true);
		expect(() =>
			resolveVideoEncoding({ codec: "vp9", imageFormat: "jpeg", pixelFormat: "yuva420p" }),
		).toThrow(/needs imageFormat "png"/);
		expect(() =>
			resolveVideoEncoding({ codec: "h264", imageFormat: "png", pixelFormat: "yuva420p" }),
		).toThrow(/alpha channel, which h264 cannot store/);
		expect(() =>
			resolveVideoEncoding({ codec: "vp8", imageFormat: "png", pixelFormat: "yuv444p" }),
		).toThrow(/cannot be used with vp8/);
		expect(resolveVideoEncoding({ codec: "gif", imageFormat: "png" })).toMatchObject({
			alpha: true,
			pixelFormat: null,
		});
	});

	it("maps numberOfGifLoops to FFmpeg's -loop (D-020)", () => {
		const loop = (numberOfGifLoops: number | null | undefined) =>
			resolveVideoEncoding({ codec: "gif", imageFormat: "jpeg", numberOfGifLoops }).gifLoop;
		expect([loop(undefined), loop(null), loop(0), loop(1), loop(5)]).toEqual([0, 0, -1, 1, 5]);
		expect(() => loop(-1)).toThrow(code("E_INVALID_OPTION"));
		expect(
			resolveVideoEncoding({ codec: "h264", imageFormat: "jpeg", numberOfGifLoops: 3 }).gifLoop,
		).toBe(null);
	});
});

describe("audio codecs per container (D-037)", () => {
	it("lists the codecs each output carries, the default first", () => {
		expect(supportedAudioCodecs("h264")).toEqual(["aac", "mp3"]);
		expect(supportedAudioCodecs("h265")).toEqual(["aac", "mp3"]);
		expect(supportedAudioCodecs("h264-mkv")?.[0]).toBe("aac");
		expect(supportedAudioCodecs("h264-mkv")).toContain("pcm-16");
		expect(supportedAudioCodecs("vp8")).toEqual(["opus"]);
		expect(supportedAudioCodecs("vp9")).toEqual(["opus"]);
		expect(supportedAudioCodecs("prores")).toEqual(["pcm-16", "aac"]);
		expect(supportedAudioCodecs("gif")).toEqual([]);
		expect(supportedAudioCodecs("av1")).toEqual(["aac", "mp3"]);
	});
});
