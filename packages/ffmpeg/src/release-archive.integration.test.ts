// D-065: the archive built locally by tools/ffmpeg-build for this platform, served over a local
// HTTP server as the release will serve it: ensureFfmpeg() downloads it, checks the pinned
// SHA-256, unpacks and verifies it, and the renderer encodes with it. Skipped when the archive
// has not been built on this machine (it is never committed).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { renderMedia, selectComposition } from "@motiojs/renderer";
import { decodeFrameStamp, type FrameStampOptions, probeVideo } from "@motiojs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixturePageDir } from "../../renderer/src/test-support/fixture-page.js";
import { ensureFfmpeg, findFfmpeg } from "./install.js";
import { FFMPEG_ARCHIVES, FFMPEG_VERSION, REQUIRED_ENCODERS } from "./manifest.js";
import { ffmpegPlatform } from "./platform.js";
import { serveFiles } from "./test-support/archives.js";

const platform = ffmpegPlatform();
const archive = platform ? FFMPEG_ARCHIVES[platform] : null;
const local = archive
	? resolve(import.meta.dirname, "../../../tools/ffmpeg-build/out", archive.file)
	: null;
const available = local !== null && existsSync(local);
if (!available) {
	console.warn(
		`release-archive tests skipped: no locally built archive for ${platform ?? "this platform"} (run tools/ffmpeg-build).`,
	);
}

describe.skipIf(!available)("the locally built release archive", () => {
	let server: Awaited<ReturnType<typeof serveFiles>>;
	let cacheDir: string;
	beforeAll(async () => {
		server = await serveFiles({ [archive?.file ?? ""]: readFileSync(local ?? "") });
		cacheDir = await mkdtemp(join(tmpdir(), "motio-ffmpeg-release-"));
	});
	afterAll(async () => {
		await server?.close();
		await rm(cacheDir, { recursive: true, force: true });
	});

	it("installs with the pinned digest and has every encoder Motio uses", async () => {
		expect(await findFfmpeg({ cacheDir })).toBeNull();
		const installed = await ensureFfmpeg({ cacheDir, baseUrl: server.url });
		expect(installed.downloaded).toBe(true);
		const version = execFileSync(installed.ffmpeg, ["-hide_banner", "-version"]).toString();
		expect(version).toContain(`ffmpeg version ${FFMPEG_VERSION}`);
		const encoders = execFileSync(installed.ffmpeg, ["-hide_banner", "-encoders"]).toString();
		for (const e of REQUIRED_ENCODERS) expect(encoders).toMatch(new RegExp(`\\s${e}\\s`));
		expect(execFileSync(installed.ffmpeg, ["-hide_banner", "-protocols"]).toString()).toMatch(
			/^\s*https$/m,
		);
		expect(await findFfmpeg({ cacheDir })).toMatchObject({ ffmpeg: installed.ffmpeg });
		expect((await ensureFfmpeg({ cacheDir, baseUrl: server.url })).downloaded).toBe(false);
		expect(server.requests).toEqual([archive?.file]);
	});

	for (const [codec, extra, expected] of [
		["av1", {}, { codec_name: "av1", pix_fmt: "yuv420p" }],
		["h265", { pixelFormat: "yuv420p10le" }, { codec_name: "hevc", pix_fmt: "yuv420p10le" }],
		["vp9", {}, { codec_name: "vp9", pix_fmt: "yuv420p" }],
	] as const) {
		it(`renders ${codec} with exact frame stamps and BT.709 tags`, async () => {
			const installed = await ensureFfmpeg({ cacheDir, baseUrl: server.url });
			const serveUrl = fixturePageDir();
			const composition = await selectComposition({
				serveUrl,
				id: "stamp",
				inputProps: { durationInFrames: 30 },
			});
			const output = join(cacheDir, `out-${codec}.${codec === "vp9" ? "webm" : "mp4"}`);
			await renderMedia({
				serveUrl,
				composition,
				codec,
				imageFormat: "png",
				enforceAudioTrack: true,
				outputLocation: output,
				ffmpegExecutable: installed.ffmpeg,
				ffprobeExecutable: installed.ffprobe,
				...extra,
			});
			const stream = JSON.parse(
				execFileSync(installed.ffprobe, [
					"-v",
					"error",
					"-select_streams",
					"v",
					"-show_entries",
					"stream=codec_name,pix_fmt,color_primaries,color_transfer,color_space,color_range",
					"-of",
					"json",
					output,
				]).toString(),
			).streams[0];
			expect(stream).toMatchObject({
				...expected,
				color_primaries: "bt709",
				color_transfer: "bt709",
				color_space: "bt709",
				color_range: "tv",
			});
			const { width, height } = await probeVideo(output, { ffprobe: installed.ffprobe });
			const raw = execFileSync(
				installed.ffmpeg,
				["-v", "error", "-i", output, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
				{ maxBuffer: 1 << 30 },
			);
			const size = width * height * 4;
			expect(raw.length / size).toBe(30);
			for (let i = 0; i < 30; i++) {
				const r = decodeFrameStamp(
					raw.subarray(i * size, (i + 1) * size),
					width,
					height,
					composition.props.stamp as FrameStampOptions,
				);
				expect(r).toMatchObject({ ok: true, frame: i });
			}
		});
	}
});
