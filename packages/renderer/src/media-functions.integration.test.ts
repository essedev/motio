import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveRenderFfmpeg } from "./ffmpeg-resolve.js";
import { extractAudio, getSilentParts, getVideoMetadata } from "./index.js";

// The media files and what the published Remotion returned for them (tools/oracle-render,
// `pnpm record:node-api`).
const FIXTURE = resolve(import.meta.dirname, "../../../fixtures/node-api");
const media = (name: string) => join(FIXTURE, "media", name);

interface OracleCase<I> {
	input: I;
	out?: unknown;
	error?: string;
}
const oracle = JSON.parse(readFileSync(join(FIXTURE, "__oracle__/remotion.json"), "utf8")) as {
	getVideoMetadata: Record<string, { out?: Record<string, unknown>; error?: string }>;
	getSilentParts: OracleCase<{
		src: string;
		noiseThresholdInDecibels?: number;
		minDurationInSeconds?: number;
	}>[];
	extractAudio: OracleCase<{ videoSource: string; ext: string }>[];
};

const dir = mkdtempSync(join(tmpdir(), "motio-media-fns-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let ffmpeg = "ffmpeg";
beforeAll(async () => {
	ffmpeg = (await resolveRenderFfmpeg()).ffmpeg;
});

/** Decoded samples of a file as signed 16-bit PCM: their count and digest. */
function pcm(path: string): { samples: number; sha256: string } {
	const r = spawnSync(ffmpeg, ["-v", "error", "-i", path, "-f", "s16le", "-"], {
		maxBuffer: 1 << 28,
	});
	expect(r.status).toBe(0);
	return {
		samples: r.stdout.length / 2,
		sha256: createHash("sha256").update(r.stdout).digest("hex"),
	};
}

describe("getVideoMetadata", () => {
	const videos = Object.entries(oracle.getVideoMetadata).filter(
		([name, c]) => c.out && !name.includes(":"),
	);

	it.each(videos)("%s: every field Remotion returns is equal", async (name, recorded) => {
		const got = await getVideoMetadata(media(name));
		const { rotation, ...remotionFields } = got;
		expect(remotionFields).toEqual(recorded.out);
		expect(rotation).toBe(name === "rotated.mp4" ? 270 : 0);
	});

	it("resolves a relative path against the working directory, as Remotion does", async () => {
		const got = await getVideoMetadata(relative(process.cwd(), media("gaps.mp4")));
		expect(got.durationInSeconds).toBe(6.5);
	});

	it("fails with E_NO_VIDEO_STREAM on audio files and E_MEDIA_SOURCE on a missing one", async () => {
		// Remotion throws for both too (recorded as errors in the oracle).
		expect(oracle.getVideoMetadata["tone.mp3"]?.error).toContain("No video stream");
		await expect(getVideoMetadata(media("tone.mp3"))).rejects.toMatchObject({
			code: "E_NO_VIDEO_STREAM",
		});
		await expect(getVideoMetadata(media("gaps.wav"))).rejects.toMatchObject({
			code: "E_NO_VIDEO_STREAM",
		});
		await expect(getVideoMetadata(media("missing.mp4"))).rejects.toMatchObject({
			code: "E_MEDIA_SOURCE",
		});
		await expect(getVideoMetadata("https://example.com/video.mp4")).rejects.toMatchObject({
			code: "E_INVALID_OPTION",
		});
		await expect(
			getVideoMetadata(media("gaps.mp4"), { logLevel: "loud" as "info" }),
		).rejects.toMatchObject({ code: "E_INVALID_OPTION" });
	});

	it("uses ffprobe from binariesDirectory", async () => {
		await expect(
			getVideoMetadata(media("gaps.mp4"), { binariesDirectory: join(dir, "no-binaries") }),
		).rejects.toMatchObject({ code: "E_FFMPEG_NOT_FOUND" });
	});
});

describe("getSilentParts", () => {
	const key = (i: OracleCase<unknown>["input"]) => JSON.stringify(i);
	// Measured differences, kept as they are (see the renderer README):
	// - Remotion's duration of an MP3 counts the encoder's padding: 2.037551 s for tone.mp3, whose
	//   audio decodes to 2.000000 s; Motio uses the container duration, 2 s.
	// - On Opus at 0 dB Remotion starts the silence 0.5 ms in, after an audible part of 0.5 ms;
	//   FFmpeg's silencedetect finds silence from the first sample.
	const DIFFERENT: Record<string, unknown> = {
		[key({ src: "tone.mp3" })]: {
			silentParts: [],
			audibleParts: [{ startInSeconds: 0, endInSeconds: 2 }],
			durationInSeconds: 2,
		},
		[key({ src: "vp9-opus.webm", noiseThresholdInDecibels: 0 })]: {
			silentParts: [{ startInSeconds: 0, endInSeconds: 2.008 }],
			audibleParts: [],
			durationInSeconds: 2.008,
		},
	};
	const succeeded = oracle.getSilentParts.filter((c) => c.out);

	it.each(succeeded.map((c) => [key(c.input), c] as const))(
		"%s: equal to Remotion",
		async (name, recorded) => {
			const got = await getSilentParts({ ...recorded.input, src: media(recorded.input.src) });
			expect(got).toEqual(DIFFERENT[name] ?? recorded.out);
		},
	);

	it("rejects the options Remotion rejects, with E_INVALID_OPTION", async () => {
		const rejected = oracle.getSilentParts.filter(
			(c) => c.error && !c.error.includes("Compositor"),
		);
		expect(rejected.length).toBe(3);
		for (const c of rejected) {
			await expect(getSilentParts({ ...c.input, src: media(c.input.src) })).rejects.toMatchObject({
				code: "E_INVALID_OPTION",
			});
		}
	});

	it("analyses PCM WAV files exactly (Remotion 4.0.545 fails on them)", async () => {
		expect(oracle.getSilentParts[0]?.error).toContain("Invalid argument");
		// gaps.wav at 8 kHz: silence 0-0.7, 1.7-3.2, 4.2-4.8, 5.2-6.5 and a quiet tone at 3.2-4.2
		// (see fixtures/node-api/generate.ts). silencedetect ends a silence on the first sample
		// above the threshold, one sample (125 µs) after the boundary.
		const defaults = await getSilentParts({ src: media("gaps.wav") });
		expect(defaults).toEqual({
			silentParts: [
				{ startInSeconds: 1.7, endInSeconds: 4.800125 },
				{ startInSeconds: 5.2, endInSeconds: 6.5 },
			],
			audibleParts: [
				{ startInSeconds: 0, endInSeconds: 1.7 },
				{ startInSeconds: 4.800125, endInSeconds: 5.2 },
			],
			durationInSeconds: 6.5,
		});
		const fine = await getSilentParts({
			src: media("gaps.wav"),
			noiseThresholdInDecibels: -30,
			minDurationInSeconds: 0.5,
		});
		expect(fine.silentParts).toEqual([
			{ startInSeconds: 0, endInSeconds: 0.700125 },
			{ startInSeconds: 1.7, endInSeconds: 3.20025 },
			{ startInSeconds: 4.199875, endInSeconds: 4.800125 },
			{ startInSeconds: 5.2, endInSeconds: 6.5 },
		]);
		expect(await getSilentParts({ src: media("silence.wav") })).toEqual({
			silentParts: [{ startInSeconds: 0, endInSeconds: 2 }],
			audibleParts: [],
			durationInSeconds: 2,
		});
	});

	it("fails with E_NO_AUDIO_STREAM on a video without audio", async () => {
		await expect(getSilentParts({ src: media("faststart.mp4") })).rejects.toMatchObject({
			code: "E_NO_AUDIO_STREAM",
		});
	});
});

describe("extractAudio", () => {
	const copied = oracle.extractAudio.filter((c) => c.out);

	it.each(copied.map((c) => [`${c.input.videoSource} to .${c.input.ext}`, c] as const))(
		"%s: the same stream as Remotion's",
		async (_, recorded) => {
			const audioOutput = join(dir, "out", `${recorded.input.videoSource}.${recorded.input.ext}`);
			await extractAudio({ videoSource: media(recorded.input.videoSource), audioOutput });
			const expected = recorded.out as { samples: number; pcmSha256: string; streams: unknown };
			const got = pcm(audioOutput);
			if (recorded.input.ext === "opus") {
				// Remotion's Ogg file decodes to 96648 samples, Motio's to 96024 (FFmpeg's Ogg muxer
				// keeps the pre-skip); the WebM source decodes to 96000.
				expect(got.samples).toBe(96024);
				expect(expected.samples).toBe(96648);
			} else {
				expect(got).toEqual({ samples: expected.samples, sha256: expected.pcmSha256 });
			}
		},
	);

	it("writes AAC into .m4a too (Remotion 4.0.545 fails on it)", async () => {
		const audioOutput = join(dir, "gaps.m4a");
		await extractAudio({ videoSource: media("gaps.mp4"), audioOutput });
		// MP4 records the encoder delay, which decoding trims: 6.5 s of samples plus the padding of
		// the last AAC frame (the ADTS .aac file above keeps the delay too: 313344 samples).
		expect(pcm(audioOutput).samples).toBe(312_000 + 320);
	});

	it("names the extension to use when the container cannot hold the codec, and leaves no file", async () => {
		const audioOutput = join(dir, "wrong", "gaps.mp3");
		await expect(
			extractAudio({ videoSource: media("gaps.mp4"), audioOutput }),
		).rejects.toMatchObject({
			code: "E_FFMPEG_FAILED",
			message: expect.stringContaining('".aac"'),
			details: expect.objectContaining({ codec: "aac", suggestedExtension: "aac" }),
		});
		expect(readdirSync(join(dir, "wrong"))).toEqual([]);
	});

	it("fails with E_NO_AUDIO_STREAM without audio and E_INVALID_OPTION without an extension", async () => {
		await expect(
			extractAudio({ videoSource: media("faststart.mp4"), audioOutput: join(dir, "none.aac") }),
		).rejects.toMatchObject({ code: "E_NO_AUDIO_STREAM" });
		expect(existsSync(join(dir, "none.aac"))).toBe(false);
		await expect(
			extractAudio({ videoSource: media("gaps.mp4"), audioOutput: join(dir, "no-extension") }),
		).rejects.toMatchObject({ code: "E_INVALID_OPTION" });
	});
});
