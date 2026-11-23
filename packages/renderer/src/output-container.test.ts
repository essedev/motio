import { describe, expect, it } from "vitest";
import { outputExtensions, resolveOutputContainer } from "./output-container.js";
import { renderMedia } from "./render-media.js";

const code = (c: string) => expect.objectContaining({ code: c });

describe("output container", () => {
	it("lists the extensions Remotion accepts for each codec and audio codec", () => {
		expect(outputExtensions("h264", "aac")).toEqual(["mp4", "mkv", "mov"]);
		expect(outputExtensions("h264", "pcm-16")).toEqual(["mkv", "mov"]);
		expect(outputExtensions("h265", "aac")).toEqual(["mp4", "mkv", "hevc"]);
		expect(outputExtensions("vp9", "opus")).toEqual(["webm"]);
		expect(outputExtensions("vp8", null)).toEqual(["webm"]);
		expect(outputExtensions("av1", "aac")).toEqual(["mp4", "mkv"]);
		expect(outputExtensions("prores", "pcm-16")).toEqual(["mov", "mkv"]);
		expect(outputExtensions("h264-mkv", "aac")).toEqual(["mkv"]);
		expect(outputExtensions("h264-ts", "aac")).toEqual(["ts"]);
		expect(outputExtensions("gif", null)).toEqual(["gif"]);
		expect(outputExtensions("aac", "aac")).toEqual(["aac", "m4a", "m4b", "3gp"]);
		expect(outputExtensions("mp3", "mp3")).toEqual(["mp3"]);
		expect(outputExtensions("wav", "pcm-16")).toEqual(["wav"]);
	});

	it("rejects an extension the codec is not written to, naming what works", () => {
		expect(() => resolveOutputContainer("vp9", "opus", "out/intro.mp4")).toThrow(
			code("E_INVALID_OPTION"),
		);
		expect(() => resolveOutputContainer("vp9", "opus", "out/intro.mp4")).toThrow(
			'The output "intro.mp4" does not fit the codec vp9 with opus audio, which is written to .webm. Rename the output, or choose a codec that writes .mp4 (h264, h265, av1).',
		);
		expect(() => resolveOutputContainer("h264", null, "a.webm")).toThrow(
			"which is written to .mp4, .mkv, .mov. Rename the output, or choose a codec that writes .webm (vp8, vp9).",
		);
		expect(() => resolveOutputContainer("gif", null, "a.mp4")).toThrow(code("E_INVALID_OPTION"));
		expect(() => resolveOutputContainer("h264", "aac", "video")).toThrow(
			"which is written to .mp4, .mkv, .mov. Rename the output.",
		);
		expect(() => resolveOutputContainer("mp3", "mp3", "a.wav")).toThrow(code("E_INVALID_OPTION"));
		expect(() => resolveOutputContainer("prores", "pcm-16", "a.mxf")).toThrow(
			code("E_INVALID_OPTION"),
		);
	});

	it("writes the container the extension names, case-insensitively", () => {
		expect(resolveOutputContainer("h264", "aac", "a.mp4")).toEqual({
			extension: ".mp4",
			muxer: "mp4",
		});
		expect(resolveOutputContainer("h264", "aac", "a.MOV")).toEqual({
			extension: ".mov",
			muxer: "mov",
		});
		expect(resolveOutputContainer("h264", "aac", "a.mkv")).toEqual({
			extension: ".mkv",
			muxer: "matroska",
		});
		expect(resolveOutputContainer("prores", "pcm-16", "a.mkv").muxer).toBe("matroska");
		expect(resolveOutputContainer("h265", null, "a.hevc")).toEqual({
			extension: ".hevc",
			muxer: "hevc",
		});
		expect(resolveOutputContainer("aac", "aac", "a.m4a")).toEqual({
			extension: ".m4a",
			muxer: null,
		});
	});

	it("keeps the codec's own container for an in-memory output", () => {
		expect(resolveOutputContainer("vp9", "opus", null)).toEqual({
			extension: ".webm",
			muxer: "webm",
		});
		expect(resolveOutputContainer("wav", "pcm-16", undefined)).toEqual({
			extension: ".wav",
			muxer: null,
		});
	});

	it("refuses audio in a raw .hevc stream", () => {
		expect(() => resolveOutputContainer("h265", "aac", "a.hevc")).toThrow(
			"cannot carry aac audio. Render it muted, or write .mp4 or .mkv.",
		);
	});

	it("makes renderMedia fail before rendering anything", async () => {
		const composition = {
			id: "c",
			width: 320,
			height: 180,
			fps: 30,
			durationInFrames: 10,
			defaultProps: {},
			props: {},
			defaultCodec: null,
			defaultOutName: null,
			defaultVideoImageFormat: null,
			defaultPixelFormat: null,
			defaultProResProfile: null,
			defaultSampleRate: null,
		};
		await expect(
			renderMedia({
				serveUrl: "/nonexistent",
				composition,
				codec: "vp9",
				outputLocation: "/nonexistent/intro.mp4",
			}),
		).rejects.toThrow(code("E_INVALID_OPTION"));
	});
});
