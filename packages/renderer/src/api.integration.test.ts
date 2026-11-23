import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	decodeFrameStamp,
	decodeImage,
	type FrameStampOptions,
	probeVideo,
} from "@motiojs/testing";
import { afterAll, describe, expect, it } from "vitest";
import {
	CHROME_VERSION,
	ensureBrowser,
	getCompositions,
	renderFrames,
	renderMedia,
	renderStill,
	selectComposition,
} from "./index.js";
import { childPids, fixturePageDir } from "./test-support/fixture-page.js";
import { stampMismatches } from "./test-support/video-checks.js";

const serveUrl = fixturePageDir();
const dir = mkdtempSync(join(tmpdir(), "motio-api-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("browser", () => {
	// The pinned image ships its browser outside the cache and points MOTIO_BROWSER_EXECUTABLE at it.
	it.skipIf(process.env.MOTIO_BROWSER_EXECUTABLE)(
		"finds the pinned chrome-headless-shell in the cache",
		async () => {
			const b = await ensureBrowser();
			expect(b.version).toBe(CHROME_VERSION);
			expect(b.downloaded).toBe(false);
			const r = spawnSync(b.executablePath, ["--version"], { encoding: "utf8" });
			expect(r.stdout).toContain(CHROME_VERSION);
		},
	);
});

describe("compositions", () => {
	it("lists compositions and runs calculateMetadata with input props", async () => {
		const list = await getCompositions({ serveUrl, inputProps: { durationInFrames: 42 } });
		expect(list.map((c) => c.id)).toContain("palette");
		const stamp = list.find((c) => c.id === "stamp");
		expect(stamp).toMatchObject({ width: 512, height: 288, fps: 30, durationInFrames: 42 });
		expect(stamp?.props).toMatchObject({
			durationInFrames: 42,
			stamp: { x: 16, y: 16, blockSize: 16 },
		});
	}, 60_000);

	it("accepts the legacy positional form", async () => {
		const list = await getCompositions(serveUrl, { inputProps: {} });
		expect(list.length).toBeGreaterThan(3);
	}, 60_000);
});

describe("renderStill", () => {
	it("renders PNG at scale 2 and JPEG and WebP at scale 1", async () => {
		const composition = await selectComposition({
			serveUrl,
			id: "stamp",
			inputProps: { durationInFrames: 100 },
		});
		const png = await renderStill({ serveUrl, composition, frame: 77, scale: 2 });
		expect(png.contentType).toBe("image/png");
		const img = await decodeImage(png.buffer as Buffer);
		expect([img.width, img.height]).toEqual([1024, 576]);
		expect(
			decodeFrameStamp(img.data, img.width, img.height, { x: 32, y: 32, blockSize: 32 }),
		).toEqual({
			ok: true,
			frame: 77,
		});
		const jpeg = await renderStill({
			serveUrl,
			composition,
			frame: -1,
			imageFormat: "jpeg",
			jpegQuality: 90,
		});
		expect(jpeg.contentType).toBe("image/jpeg");
		const j = await decodeImage(jpeg.buffer as Buffer);
		expect(
			decodeFrameStamp(j.data, j.width, j.height, composition.props.stamp as FrameStampOptions),
		).toEqual({
			ok: true,
			frame: 99,
		});
		const webp = await renderStill({ serveUrl, composition, imageFormat: "webp" });
		expect(webp.buffer?.subarray(8, 12).toString()).toBe("WEBP");
	}, 60_000);

	it("captures PNG with a transparent background and JPEG on white", async () => {
		const composition = await selectComposition({ serveUrl, id: "alpha" });
		const png = await decodeImage((await renderStill({ serveUrl, composition })).buffer as Buffer);
		const px = (img: { data: Uint8Array; width: number }, x: number, y: number) => [
			...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4),
		];
		expect(px(png, 16, 16)).toEqual([255, 0, 0, 255]);
		expect(px(png, 48, 48)[3]).toBe(0);
		const jpeg = await decodeImage(
			(await renderStill({ serveUrl, composition, imageFormat: "jpeg", jpegQuality: 100 }))
				.buffer as Buffer,
		);
		expect(px(jpeg, 48, 48).every((v) => v >= 250)).toBe(true);
	}, 60_000);

	it("writes to a file and respects overwrite: false", async () => {
		const composition = await selectComposition({ serveUrl, id: "palette" });
		const output = join(dir, "still.png");
		writeFileSync(output, "existing");
		await expect(
			renderStill({ serveUrl, composition, output, overwrite: false }),
		).rejects.toMatchObject({
			code: "E_OUTPUT_EXISTS",
		});
		const res = await renderStill({ serveUrl, composition, output });
		expect(res.buffer).toBeNull();
		expect(readFileSync(output).subarray(1, 4).toString()).toBe("PNG");
	}, 60_000);
});

describe("renderFrames", () => {
	it("writes an image sequence for a frame range and reports each frame", async () => {
		const composition = await selectComposition({
			serveUrl,
			id: "stamp",
			inputProps: { durationInFrames: 300 },
		});
		const outputDir = join(dir, "frames");
		const updates: number[] = [];
		let start: unknown;
		const res = await renderFrames({
			serveUrl,
			composition,
			outputDir,
			frameRange: [10, 29],
			everyNthFrame: 2,
			concurrency: 2,
			onStart: (d) => {
				start = d;
			},
			onFrameUpdate: (n, frame) => updates.push(frame + n * 0),
		});
		expect(res.frameCount).toBe(10);
		expect(start).toEqual({ frameCount: 10, parallelEncoding: false, resolvedConcurrency: 2 });
		expect([...updates].sort((a, b) => a - b)).toEqual([10, 12, 14, 16, 18, 20, 22, 24, 26, 28]);
		const files = readdirSync(outputDir).sort();
		expect(files[0]).toBe("element-010.jpeg");
		expect(files).toHaveLength(10);
		const img = await decodeImage(readFileSync(join(outputDir, "element-016.jpeg")));
		expect(
			decodeFrameStamp(
				img.data,
				img.width,
				img.height,
				composition.props.stamp as FrameStampOptions,
			),
		).toEqual({
			ok: true,
			frame: 16,
		});
	}, 60_000);
});

describe("renderMedia", () => {
	it("returns a buffer when no output location is given, with progress and slowest frames", async () => {
		const composition = await selectComposition({
			serveUrl,
			id: "stamp",
			inputProps: { durationInFrames: 30 },
		});
		let last: { renderedFrames: number; encodedFrames: number; progress: number } | undefined;
		const res = await renderMedia({
			serveUrl,
			composition,
			codec: "h264",
			crf: 23,
			x264Preset: "veryfast",
			onProgress: (p) => {
				last = p;
			},
		});
		expect(res.contentType).toBe("video/mp4");
		expect(res.slowestFrames).toHaveLength(10);
		expect(last).toMatchObject({ renderedFrames: 30, encodedFrames: 30, progress: 1 });
		const file = join(dir, "buffer.mp4");
		writeFileSync(file, res.buffer as Buffer);
		expect((await probeVideo(file)).frameCount).toBe(30);
	}, 60_000);

	it("recycles pages and survives a browser crash mid-render", async () => {
		const composition = await selectComposition({
			serveUrl,
			id: "stamp",
			inputProps: { durationInFrames: 240 },
		});
		const out = join(dir, "crash.mp4");
		const seen = new Set<number>();
		let killed = false;
		await renderMedia({
			serveUrl,
			composition,
			codec: "h264",
			concurrency: 3,
			recycleEveryNFrames: 25,
			outputLocation: out,
			onProgress: (p) => {
				for (const pid of childPids()) {
					// The command line, not `comm`: Linux truncates `comm` to 15 characters.
					const args = spawnSync("ps", ["-o", "args=", "-p", String(pid)], {
						encoding: "utf8",
					}).stdout;
					if (args.includes("chrome-headless-shell")) {
						seen.add(pid);
						if (!killed && p.renderedFrames >= 60) {
							killed = true;
							process.kill(pid, "SIGKILL");
						}
					}
				}
			},
		});
		expect(killed).toBe(true);
		// 240 frames on 3 pages recycled every 25 frames need at least 9 browser processes.
		expect(seen.size).toBeGreaterThanOrEqual(9);
		const { frames, mismatches } = await stampMismatches(
			out,
			(i) => i,
			composition.props.stamp as FrameStampOptions,
		);
		expect(mismatches).toEqual([]);
		expect(frames).toBe(240);
	}, 120_000);
});
