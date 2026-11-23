import type { AudioIntent } from "@motiojs/core/protocol";
import { describe, expect, it } from "vitest";
import { buildAudioSegments } from "./audio.js";
import { resolveAudioBitrate, resolveAudioCodec, resolveSampleRate } from "./audio-options.js";
import { isMotioError } from "./errors.js";
import { resolveFfprobePath } from "./ffmpeg.js";

function intent(patch: Partial<AudioIntent>): AudioIntent {
	return {
		id: "0",
		src: "http://127.0.0.1/a.wav",
		sourceFrame: 0,
		playbackRate: 1,
		toneFrequency: 1,
		preservePitch: true,
		volume: 1,
		audioStreamIndex: null,
		...patch,
	};
}

function frames(from: number, to: number): number[] {
	return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

describe("buildAudioSegments", () => {
	it("joins consecutive frames into one segment with a constant volume", () => {
		const intents = new Map(frames(15, 89).map((f) => [f, [intent({ sourceFrame: 6 + f - 15 })]]));
		expect(buildAudioSegments(frames(0, 89), intents)).toEqual([
			{
				src: "http://127.0.0.1/a.wav",
				startFrame: 15,
				trimBeforeFrames: 6,
				durationInFrames: 75,
				playbackRate: 1,
				toneFrequency: 1,
				preservePitch: true,
				volume: 1,
			},
		]);
	});

	it("keeps per-frame volumes and the playback rate", () => {
		const intents = new Map(
			frames(0, 3).map((f) => [
				f,
				[intent({ sourceFrame: 2 * f, playbackRate: 2, volume: f / 4 })],
			]),
		);
		const [segment] = buildAudioSegments(frames(0, 3), intents);
		expect(segment?.volume).toEqual([0, 0.25, 0.5, 0.75]);
		expect(segment?.playbackRate).toBe(2);
	});

	it("starts a new segment when the source position jumps (a loop restart)", () => {
		const intents = new Map(frames(0, 59).map((f) => [f, [intent({ sourceFrame: f % 30 })]]));
		const segments = buildAudioSegments(frames(0, 59), intents);
		expect(segments.map((s) => [s.startFrame, s.trimBeforeFrames, s.durationInFrames])).toEqual([
			[0, 0, 30],
			[30, 0, 30],
		]);
	});

	it("places segments on the output timeline of a frame range", () => {
		const intents = new Map(frames(0, 89).map((f) => [f, [intent({ sourceFrame: f })]]));
		const [segment] = buildAudioSegments(frames(30, 89), intents);
		expect(segment).toMatchObject({ startFrame: 0, trimBeforeFrames: 30, durationInFrames: 60 });
	});

	it("keeps identical sources with different ids apart and passes the audio stream", () => {
		const intents = new Map([
			[0, [intent({ id: "0", audioStreamIndex: 1 }), intent({ id: "1", volume: 0.5 })]],
		]);
		const segments = buildAudioSegments([0], intents);
		expect(segments).toHaveLength(2);
		expect(segments.find((s) => s.volume === 1)?.audioStreamIndex).toBe(1);
	});

	it("separates a gap in the source from a pause in the output", () => {
		const intents = new Map([
			[0, [intent({ sourceFrame: 0 })]],
			[2, [intent({ sourceFrame: 2 })]],
		]);
		expect(buildAudioSegments(frames(0, 2), intents)).toHaveLength(2);
	});
});

describe("audio options", () => {
	it("defaults per codec and validates combinations", () => {
		expect(resolveAudioCodec("h264", undefined, false)).toBe("aac");
		expect(resolveAudioCodec("h264", "mp3", false)).toBe("mp3");
		expect(resolveAudioCodec("wav", undefined, false)).toBe("pcm-16");
		expect(resolveAudioCodec("mp3", null, true)).toBe("mp3");
		expect(resolveAudioCodec("wav", undefined, true)).toBe("pcm-16");
		for (const bad of [
			() => resolveAudioCodec("h264", "pcm-16", false),
			() => resolveAudioCodec("h264", "flac", false),
			() => resolveAudioCodec("vp9", undefined, false),
		]) {
			let error: unknown;
			try {
				bad();
			} catch (e) {
				error = e;
			}
			expect(isMotioError(error)).toBe(true);
		}
	});

	it("validates bitrate and sample rate", () => {
		expect(resolveAudioBitrate(undefined)).toBe("320k");
		expect(resolveAudioBitrate("128K")).toBe("128K");
		expect(() => resolveAudioBitrate("loud")).toThrow(/audioBitrate/);
		expect(resolveSampleRate(null)).toBe(48000);
		expect(resolveSampleRate(44100)).toBe(44100);
		expect(() => resolveSampleRate(44.1)).toThrow(/sampleRate/);
	});

	it("finds ffprobe next to an explicit ffmpeg", () => {
		const env = process.env.MOTIO_FFPROBE;
		delete process.env.MOTIO_FFPROBE;
		try {
			expect(resolveFfprobePath(null, "/opt/ff/bin/ffmpeg")).toBe("/opt/ff/bin/ffprobe");
			expect(resolveFfprobePath(null, "ffmpeg")).toBe("ffprobe");
			expect(resolveFfprobePath("/x/probe", "ffmpeg")).toBe("/x/probe");
		} finally {
			if (env !== undefined) process.env.MOTIO_FFPROBE = env;
		}
	});
});
