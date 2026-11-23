import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "./main.js";
import type { VideoConfig } from "./renderer-api.js";
import {
	COMPOSITION,
	fakeBundler,
	fakeRenderer,
	type TestIo,
	testDeps,
	testIo,
	validator,
} from "./test-support/fakes.js";

const validate = validator();
let cwd: string;
beforeEach(async () => {
	cwd = await mkdtemp(join(tmpdir(), "motio-cli-"));
});
afterEach(() => rm(cwd, { recursive: true, force: true }));

function parseJson(io: TestIo): Record<string, unknown> {
	expect(io.out).toHaveLength(1);
	return JSON.parse(io.out[0] as string);
}

async function run(argv: string[], setup: Parameters<typeof fakeRenderer>[0] = {}) {
	const io = testIo(cwd);
	const { renderer, calls, distributed } = fakeRenderer(setup);
	const { bundler, bundles } = fakeBundler();
	const code = await runCli(
		argv,
		io,
		testDeps(renderer, bundler, { distributed: async () => distributed }),
	);
	return { io, calls, bundles, code };
}

describe("render", () => {
	it("bundles, selects the composition and renders with the mapped options", async () => {
		const { io, calls, bundles, code } = await run([
			"render",
			"Main",
			"--json",
			'--props={"title":"x"}',
			"--frames=0-9",
			"--every-nth-frame=2",
			"--codec=h264",
			"--crf=20",
			"--image-format=png",
			"--concurrency=50%",
			"--scale=0.5",
			"--muted",
			"--pixel-format=yuv420p",
			"--color-space=bt709",
			"--timeout=5000",
			"--gl=swangle",
			"--overwrite=false",
		]);
		expect(code).toBe(0);
		const result = parseJson(io);
		expect(validate("render", result)).toBeNull();
		expect(result).toMatchObject({
			ok: true,
			command: "render",
			codec: "h264",
			renderedFrames: 10,
		});
		expect(result.output).toBe(join(cwd, "out", "Main.mp4"));
		expect(result.warnings).toEqual(["Config.setRspack() has no effect."]);
		const options = calls.renderMedia?.[0] as Record<string, unknown>;
		expect(options).toMatchObject({
			inputProps: { title: "x" },
			envVariables: { REMOTION_X: "1" },
			frameRange: [0, 9],
			everyNthFrame: 2,
			crf: 20,
			imageFormat: "png",
			concurrency: "50%",
			scale: 0.5,
			muted: true,
			pixelFormat: "yuv420p",
			colorSpace: "bt709",
			timeoutInMilliseconds: 5000,
			chromiumOptions: expect.objectContaining({ gl: "swangle" }),
			overwrite: false,
			cancelSignal: { fake: true },
		});
		expect(bundles).toHaveLength(1);
		expect(existsSync(bundles[0] as string)).toBe(false);
	});

	it("passes the audio flags", async () => {
		const { calls, code } = await run([
			"render",
			"Main",
			"--json",
			"--audio-codec=mp3",
			"--audio-bitrate=128k",
			"--enforce-audio-track",
			"--sample-rate=44100",
			"--separate-audio-to=out/sound.mp3",
		]);
		expect(code).toBe(0);
		expect(calls.renderMedia?.[0]).toMatchObject({
			audioCodec: "mp3",
			audioBitrate: "128k",
			enforceAudioTrack: true,
			sampleRate: 44100,
			separateAudioTo: join(cwd, "out", "sound.mp3"),
		});
	});

	it("passes the ProRes and GIF flags", async () => {
		const prores = await run(["render", "Main", "out/a.mov", "--json", "--prores-profile=4444"]);
		expect(prores.code).toBe(0);
		expect(prores.calls.renderMedia?.[0]).toMatchObject({ codec: "prores", proResProfile: "4444" });
		const gif = await run(["render", "Main", "out/a.gif", "--json", "--number-of-gif-loops=0"]);
		expect(gif.code).toBe(0);
		expect(gif.calls.renderMedia?.[0]).toMatchObject({ codec: "gif", numberOfGifLoops: 0 });
		const bad = await run(["render", "Main", "--json", "--prores-profile=best"]);
		expect(bad.code).toBe(2);
	});

	it("renders in chunks with --frames-per-chunk or --chunks (Motio, D-039)", async () => {
		const { io, calls, code } = await run([
			"render",
			"Main",
			"out/a.mov",
			"--frames-per-chunk=5",
			"--concurrency=3",
			"--concurrency-per-chunk=2",
			"--prores-profile=4444",
			"--separate-audio-to=out/a.wav",
			"--json",
		]);
		expect(code).toBe(0);
		expect(validate("render", parseJson(io))).toBeNull();
		expect(calls.renderMedia).toBeUndefined();
		expect(calls.renderDistributed?.[0]).toMatchObject({
			codec: "prores",
			framesPerChunk: 5,
			concurrency: 3,
			concurrencyPerChunk: 2,
			proResProfile: "4444",
			outputLocation: join(cwd, "out", "a.mov"),
			separateAudioTo: join(cwd, "out", "a.wav"),
		});
		const both = await run(["render", "Main", "--chunks=2", "--frames-per-chunk=5", "--json"]);
		expect(both.code).toBe(2);
		const percent = await run(["render", "Main", "--chunks=2", "--concurrency=50%", "--json"]);
		expect(percent.code).toBe(2);
	});

	it("renders an image sequence into a folder with --sequence or a list of frames", async () => {
		const { io, calls, code } = await run([
			"render",
			"Main",
			"out/frames",
			"--sequence",
			"--image-format=png",
			"--image-sequence-pattern=f-[frame].[ext]",
			"--frames=0-4",
			"--json",
		]);
		expect(code).toBe(0);
		const result = parseJson(io);
		expect(validate("render", result)).toBeNull();
		expect(result).toMatchObject({
			codec: null,
			sequence: true,
			imageFormat: "png",
			output: join(cwd, "out", "frames"),
		});
		expect(calls.renderMedia).toBeUndefined();
		expect(calls.renderFrames?.[0]).toMatchObject({
			outputDir: join(cwd, "out", "frames"),
			imageFormat: "png",
			imageSequencePattern: "f-[frame].[ext]",
			frameRange: [0, 4],
		});
		const list = await run(["render", "Main", "--frames=0,5,9", "--json"]);
		expect(parseJson(list.io)).toMatchObject({ sequence: true, output: join(cwd, "out", "Main") });
		expect(list.calls.renderFrames?.[0]).toMatchObject({
			frameRange: [
				[0, 0],
				[5, 5],
				[9, 9],
			],
		});
	});

	it("takes the output positional and infers the codec from its extension", async () => {
		const { io, calls } = await run(["render", "src/index.ts", "Main", "out/video.webm", "--json"]);
		expect(parseJson(io)).toMatchObject({ codec: "vp8", output: join(cwd, "out", "video.webm") });
		expect(calls.renderMedia?.[0]?.codec).toBe("vp8");
	});

	it("applies composition overrides", async () => {
		const { calls } = await run(["render", "Main", "--width=100", "--duration=5", "--json"]);
		expect(calls.renderMedia?.[0]?.composition).toMatchObject({
			width: 100,
			durationInFrames: 5,
			height: 8,
		});
	});

	it("fails without a composition id and lists the available ones", async () => {
		const { io, code } = await run(["render", "--json"], {
			compositions: [COMPOSITION, { ...COMPOSITION, id: "Other" } as VideoConfig],
		});
		expect(code).toBe(1);
		const result = parseJson(io);
		expect(validate("render", result)).toBeNull();
		expect(result).toMatchObject({
			ok: false,
			command: "render",
			error: { code: "E_COMPOSITION_REQUIRED", context: { compositions: ["Main", "Other"] } },
		});
	});

	it("reports renderer errors with their code and context", async () => {
		const { io, code } = await run(["render", "Nope", "--json"]);
		expect(code).toBe(1);
		expect(parseJson(io)).toMatchObject({
			ok: false,
			error: { code: "E_COMPOSITION_NOT_FOUND", context: { composition: "Nope" } },
		});
	});

	it("rejects invalid flags with exit code 2", async () => {
		for (const argv of [
			["render", "Main", "--crf=abc", "--json"],
			["render", "Main", "--unknown-flag", "--json"],
			["render", "Main", "--frames=9-1", "--json"],
			["render", "Main", "--props=[1]", "--json"],
		]) {
			const { io, code } = await run(argv);
			expect(code, argv.join(" ")).toBe(2);
			const result = parseJson(io);
			expect(validate("render", result)).toBeNull();
			expect(result).toMatchObject({ ok: false, error: { code: "E_INVALID_ARGUMENT" } });
		}
	});

	it("prints concise human output", async () => {
		const { io, code } = await run(["render", "Main"]);
		expect(code).toBe(0);
		expect(io.out.join("")).toMatch(/^Rendered Main to .*Main\.mp4 in \d+\.\ds\n$/);
		expect(io.err.join("")).toContain("warning: Config.setRspack() has no effect.");
	});
});

describe("still", () => {
	it("renders a frame counted from the end with the still format", async () => {
		const { io, calls, code } = await run([
			"still",
			"Main",
			"--frame=-1",
			"--image-format=jpeg",
			"--json",
		]);
		expect(code).toBe(0);
		const result = parseJson(io);
		expect(validate("still", result)).toBeNull();
		expect(result).toMatchObject({
			frame: 19,
			imageFormat: "jpeg",
			output: join(cwd, "out", "Main.jpeg"),
		});
		expect(calls.renderStill?.[0]).toMatchObject({ frame: 19, imageFormat: "jpeg" });
	});

	it("rejects a frame outside the composition", async () => {
		const { io, code } = await run(["still", "Main", "--frame=20", "--json"]);
		expect(code).toBe(2);
		expect(parseJson(io)).toMatchObject({ error: { code: "E_INVALID_ARGUMENT" } });
	});
});

describe("compositions", () => {
	it("lists compositions in JSON and quietly as ids", async () => {
		const json = await run(["compositions", "--json"]);
		const result = parseJson(json.io);
		expect(validate("compositions", result)).toBeNull();
		expect(result.compositions).toEqual([
			{
				id: "Main",
				width: 16,
				height: 8,
				fps: 30,
				durationInFrames: 20,
				defaultProps: { title: "hello" },
			},
		]);
		const quiet = await run(["compositions", "-q"]);
		expect(quiet.io.out.join("")).toBe("Main\n");
	});
});

describe("frames", () => {
	it("renders evenly spaced frames into a contact sheet", async () => {
		const { io, calls, code } = await run([
			"frames",
			"Main",
			"--count=5",
			"--cell-width=32",
			"--json",
		]);
		expect(code).toBe(0);
		const result = parseJson(io);
		expect(validate("frames", result)).toBeNull();
		expect(result.frames).toEqual([0, 5, 10, 14, 19]);
		expect(result.grid).toEqual({ columns: 3, rows: 2, cellWidth: 32, cellHeight: 16, padding: 4 });
		expect(calls.renderFrames?.[0]).toMatchObject({ frames: [0, 5, 10, 14, 19], outputDir: null });
		expect(existsSync(result.output as string)).toBe(true);
	});
});

describe("check determinism", () => {
	it("passes when every run gives the same pixels", async () => {
		const { io, calls, code } = await run([
			"check",
			"determinism",
			"Main",
			"--frames=0-5",
			"--concurrency=2",
			"--json",
		]);
		expect(code).toBe(0);
		const result = parseJson(io);
		expect(validate("check-determinism", result)).toBeNull();
		expect(result).toMatchObject({
			deterministic: true,
			mismatches: [],
			frames: [0, 1, 2, 3, 4, 5],
		});
		expect(
			calls.renderFrames?.map((c) => [
				c.concurrency,
				(c.frameOrder as (f: number[]) => number[])([1, 2]),
			]),
		).toEqual([
			[1, [1, 2]],
			[1, [2, 1]],
			[2, [1, 2]],
			[2, [2, 1]],
		]);
	});

	it("compares every run with a new page per frame with --reference fresh", async () => {
		const { io, calls, code } = await run(
			["check", "determinism", "Main", "--frames=0-5", "--reference=fresh", "--json"],
			// The reference (run 0) differs on frame 2 from runs that agree with each other.
			{ level: (frame, run) => (frame === 2 && run === 0 ? 77 : frame * 10) },
		);
		expect(code).toBe(3);
		const result = parseJson(io);
		expect(validate("check-determinism", result)).toBeNull();
		expect(result.reference).toBe("fresh");
		expect((result.runs as unknown[])[0]).toEqual({
			order: "ascending",
			concurrency: 1,
			freshPage: true,
		});
		expect(result.runs).toHaveLength(5);
		expect((result.mismatches as Array<{ frame: number }>).map((m) => m.frame)).toEqual([2]);
		expect(calls.renderFrames?.map((c) => c.recycleEveryNFrames)).toEqual([
			1,
			undefined,
			undefined,
			undefined,
			undefined,
		]);
	});

	it("keeps the default reference and refuses an unknown one", async () => {
		const ok = await run(["check", "determinism", "Main", "--frames=0-1", "--json"]);
		expect(parseJson(ok.io)).toMatchObject({ reference: "runs" });
		expect(ok.calls.renderFrames).toHaveLength(4);
		const bad = await run(["check", "determinism", "Main", "--reference=page", "--json"]);
		expect(bad.code).toBe(2);
	});

	it("reports frames whose pixels differ between runs, with exit code 3", async () => {
		const { io, code } = await run(["check", "determinism", "Main", "--frames=0-5", "--json"], {
			level: (frame, run) => (frame === 3 && run === 2 ? 99 : frame * 10),
		});
		expect(code).toBe(3);
		const result = parseJson(io);
		expect(validate("check-determinism", result)).toBeNull();
		expect(result.deterministic).toBe(false);
		const mismatches = result.mismatches as Array<{ frame: number; hashes: string[] }>;
		expect(mismatches.map((m) => m.frame)).toEqual([3]);
		expect(new Set(mismatches[0]?.hashes).size).toBe(2);
	});
});

describe("check flicker", () => {
	it("flags a one-frame glitch but not steady motion", async () => {
		const { io, code } = await run(["check", "flicker", "Main", "--json"], {
			level: (frame) => (frame === 7 ? 250 : frame * 5),
		});
		expect(code).toBe(3);
		const result = parseJson(io);
		expect(validate("check-flicker", result)).toBeNull();
		expect((result.flagged as Array<{ frame: number }>).map((f) => f.frame)).toEqual([7]);
	});

	it("passes on smooth frames", async () => {
		const { io, code } = await run(["check", "flicker", "Main", "--threshold=0.01", "--json"]);
		expect(code).toBe(0);
		expect(parseJson(io)).toMatchObject({ clean: true, flagged: [], frames: 20, threshold: 0.01 });
	});
});

describe("browser ensure", () => {
	it("downloads through the renderer", async () => {
		const { io, code } = await run(["browser", "ensure", "--json"]);
		expect(code).toBe(0);
		const result = parseJson(io);
		expect(validate("browser-ensure", result)).toBeNull();
		expect(result).toMatchObject({
			executablePath: "/cache/chrome",
			downloaded: true,
			source: "pinned",
		});
	});

	it("checks a user browser without downloading", async () => {
		const { io, code, calls } = await run([
			"browser",
			"ensure",
			"--browser-executable",
			process.execPath,
			"--json",
		]);
		expect(code).toBe(0);
		expect(parseJson(io)).toMatchObject({ executablePath: process.execPath, source: "user" });
		expect(calls.ensureBrowser).toBeUndefined();
	});
});

describe("FFmpeg resolution (D-065)", () => {
	const pinned = {
		ffmpeg: "/cache/ffmpeg/8.1.3-1/linux-x64/bin/ffmpeg",
		ffprobe: "/cache/ffmpeg/8.1.3-1/linux-x64/bin/ffprobe",
		source: "package" as const,
		pinned: { version: "8.1.3", build: 1 },
	};

	async function runWith(
		argv: string[],
		overrides: Partial<Parameters<typeof testDeps>[2]>,
		rendererOverrides: Partial<ReturnType<typeof fakeRenderer>["renderer"]> = {},
	) {
		const io = testIo(cwd);
		const { renderer, calls } = fakeRenderer();
		const { bundler } = fakeBundler();
		const code = await runCli(
			argv,
			io,
			testDeps({ ...renderer, ...rendererOverrides }, bundler, overrides),
		);
		return { io, calls, code };
	}

	it("render passes the resolved FFmpeg to the renderer and records it in the result", async () => {
		const { io, calls, code } = await runWith(
			["render", "Main", "--json"],
			{ resolveFfmpeg: async () => pinned },
			{
				probeFfmpeg: async (path) => ({
					path,
					version: "8.1.3",
					encoders: new Set(),
					decoders: new Set(),
				}),
			},
		);
		expect(code).toBe(0);
		const result = parseJson(io);
		expect(validate("render", result)).toBeNull();
		expect(result.ffmpeg).toEqual({
			path: pinned.ffmpeg,
			version: "8.1.3",
			source: "package",
			build: 1,
		});
		expect(calls.renderMedia?.[0]).toMatchObject({
			ffmpegExecutable: pinned.ffmpeg,
			ffprobeExecutable: pinned.ffprobe,
		});
	});

	it("ffmpeg ensure fails with a stable code when @motiojs/ffmpeg is not installed", async () => {
		const { io, code } = await runWith(
			["ffmpeg", "ensure", "--json"],
			{},
			{
				loadFfmpegPackage: async () => null,
			},
		);
		expect(code).toBe(1);
		const result = parseJson(io);
		expect(validate("ffmpeg-ensure", result)).toBeNull();
		expect(result.error).toMatchObject({ code: "E_FFMPEG_PACKAGE_MISSING" });
	});

	it("ffmpeg ensure installs through the package and reports the build", async () => {
		const progress: number[] = [];
		const { io, code } = await runWith(
			["ffmpeg", "ensure", "--json"],
			{},
			{
				loadFfmpegPackage: async () => ({
					ensureFfmpeg: async (o) => {
						o?.onProgress?.({ downloadedBytes: 1, totalBytes: 2 });
						progress.push(1);
						return {
							ffmpeg: pinned.ffmpeg,
							ffprobe: pinned.ffprobe,
							version: "8.1.3",
							build: 1,
							platform: "linux-x64",
							directory: "/cache/ffmpeg/8.1.3-1/linux-x64",
							downloaded: true,
						};
					},
				}),
			},
		);
		expect(code).toBe(0);
		const result = parseJson(io);
		expect(validate("ffmpeg-ensure", result)).toBeNull();
		expect(result).toMatchObject({ ffmpeg: pinned.ffmpeg, downloaded: true, build: 1 });
		expect(progress).toEqual([1]);
	});

	it("doctor reports a resolution error as a failed check", async () => {
		const { io, code } = await runWith(["doctor", "--json"], {
			resolveFfmpeg: async () => {
				throw Object.assign(new Error("no build for win32-arm64"), {
					code: "E_FFMPEG_UNSUPPORTED_PLATFORM",
				});
			},
		});
		expect(code).toBe(3);
		const result = parseJson(io);
		expect(validate("doctor", result)).toBeNull();
		expect((result.checks as Array<Record<string, unknown>>)[1]).toMatchObject({
			name: "ffmpeg",
			status: "fail",
			details: { code: "E_FFMPEG_UNSUPPORTED_PLATFORM" },
		});
	});

	it("doctor reports a pinned build that is not downloaded yet, without downloading", async () => {
		const asked: unknown[] = [];
		const { io } = await runWith(["doctor", "--json"], {
			resolveFfmpeg: async (options) => {
				asked.push(options);
				return null;
			},
		});
		const result = parseJson(io);
		expect(validate("doctor", result)).toBeNull();
		const ffmpeg = (result.checks as Array<{ name: string; status: string; message: string }>)[1];
		expect(ffmpeg).toMatchObject({ name: "ffmpeg", status: "warn" });
		expect(ffmpeg?.message).toContain("motio ffmpeg ensure");
		expect(asked).toEqual([{ download: false }]);
	});
});

describe("doctor", () => {
	it("runs every check and validates against the schema", async () => {
		const { io } = await run(["doctor", "--json"]);
		const result = parseJson(io);
		expect(validate("doctor", result)).toBeNull();
		const names = (result.checks as Array<{ name: string }>).map((c) => c.name);
		expect(names).toEqual([
			"node",
			"ffmpeg",
			"ffprobe",
			"browser",
			"config",
			"entry-point",
			"compatibility",
		]);
	});
});

describe("general", () => {
	it("prints help and rejects unknown commands", async () => {
		const help = await run(["--help"]);
		expect(help.io.out.join("")).toContain("check determinism");
		const helpJson = await run(["--json"]);
		expect(validate("help", parseJson(helpJson.io))).toBeNull();
		const unknown = await run(["paint", "--json"]);
		expect(unknown.code).toBe(2);
		expect(validate("render", parseJson(unknown.io))).toBeNull();
		const commandHelp = await run(["check", "flicker", "--help"]);
		expect(commandHelp.io.out.join("")).toContain("--threshold");
	});
});
