// D-013 proof: on a machine where the BeginFrame probe succeeds (the pinned Linux image), the
// BeginFrame capture path gives the same decoded pixels as Page.captureScreenshot on every fixture
// composition, and its speed is measured. Skipped where BeginFrame is unavailable (macOS).
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createBundle } from "@motiojs/bundler";
import {
	type CaptureMethod,
	ensureBrowser,
	getCompositions,
	probeBeginFrame,
	renderFrames,
	selectComposition,
} from "@motiojs/renderer";
import { decodeImage, hashFrame } from "@motiojs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixturePageDir } from "../../renderer/src/test-support/fixture-page.js";

const ROOT = resolve(import.meta.dirname, "../../..");
const executable = process.env.MOTIO_BROWSER_EXECUTABLE ?? (await ensureBrowser()).executablePath;
const probe = await probeBeginFrame(executable);

let outDir: string;
const bundles = new Map<string, string>();

beforeAll(async () => {
	if (!probe.supported) return;
	outDir = await mkdtemp(join(tmpdir(), "motio-begin-frame-"));
	for (const [name, rootDir] of [
		["compositions", join(ROOT, "fixtures/compositions")],
		["media", join(ROOT, "fixtures/media")],
		["hello", join(ROOT, "packages/cli/test-fixtures/hello")],
	] as const) {
		const bundle = await createBundle({
			entryPoint: "src/index.ts",
			rootDir,
			outDir: join(outDir, name),
		});
		bundles.set(name, bundle.serveUrl);
	}
	bundles.set("protocol", fixturePageDir());
}, 300_000);

afterAll(async () => {
	if (outDir) await rm(outDir, { recursive: true, force: true });
});

/** Decoded RGBA hashes of the frames, captured with one method. */
async function capture(
	serveUrl: string,
	id: string,
	frames: number[],
	method: CaptureMethod,
	imageFormat: "png" | "jpeg",
): Promise<Map<number, string>> {
	const composition = await selectComposition({ serveUrl, id, inputProps: {} });
	const images = new Map<number, Buffer>();
	await renderFrames({
		serveUrl,
		composition,
		outputDir: null,
		frames,
		imageFormat,
		// BeginFrame capture is refused above concurrency 1 (one page at a time).
		concurrency: method === "begin-frame" ? 1 : 2,
		captureMethod: method,
		onFrameBuffer: (buffer, frame) => {
			images.set(frame, buffer);
		},
	});
	const hashes = new Map<number, string>();
	for (const [frame, image] of images)
		hashes.set(frame, hashFrame((await decodeImage(image)).data));
	return hashes;
}

/** Frames that differ between the two capture paths. */
async function differing(
	serveUrl: string,
	id: string,
	frames: number[],
	imageFormat: "png" | "jpeg" = "png",
): Promise<number[]> {
	const screenshot = await capture(serveUrl, id, frames, "screenshot", imageFormat);
	const beginFrame = await capture(serveUrl, id, frames, "begin-frame", imageFormat);
	expect(beginFrame.size).toBe(frames.length);
	return frames.filter((f) => screenshot.get(f) !== beginFrame.get(f));
}

function framesOf(file: string): Record<string, number[]> {
	return JSON.parse(readFileSync(join(ROOT, file), "utf8")) as Record<string, number[]>;
}

// The identity tests below run only where BeginFrame works. On Linux (the pinned image) the probe
// must succeed, so they cannot be skipped there by accident; elsewhere the skip says where to
// run them (docker/README.md).
it("probes BeginFrame: required on Linux, reported elsewhere", () => {
	if (process.platform === "linux") {
		expect(probe.supported, probe.reason).toBe(true);
	} else if (!probe.supported) {
		console.log(
			`BeginFrame identity tests skipped on ${process.platform}: ${probe.reason ?? "unsupported"}. Run them in the Linux image (docker/README.md).`,
		);
	}
});

describe.skipIf(!probe.supported)("BeginFrame capture equals the screenshot path", () => {
	for (const [id, frames] of Object.entries(framesOf("fixtures/compositions/frames.json"))) {
		it(`compositions/${id}: frames ${frames.join(", ")}`, async () => {
			expect(await differing(bundles.get("compositions") as string, id, frames)).toEqual([]);
		});
	}

	it("media: every video composition, first, middle and last frame", async () => {
		const serveUrl = bundles.get("media") as string;
		const list = await getCompositions({ serveUrl, inputProps: {} });
		const failures: string[] = [];
		for (const c of list) {
			const frames = [...new Set([0, Math.floor(c.durationInFrames / 2), c.durationInFrames - 1])];
			for (const f of await differing(serveUrl, c.id, frames)) failures.push(`${c.id}@${f}`);
		}
		expect(list.length).toBeGreaterThan(0);
		expect(failures).toEqual([]);
	}, 600_000);

	it("a CSS background image on the first frame of a page (CLI hello fixture)", async () => {
		const frames = Array.from({ length: 30 }, (_, i) => i);
		expect(await differing(bundles.get("hello") as string, "Hello", frames)).toEqual([]);
	});

	it("protocol fixtures: frame stamps, palette, effect state and alpha, PNG and JPEG", async () => {
		const serveUrl = bundles.get("protocol") as string;
		const stamps = Array.from({ length: 120 }, (_, i) => i * 7);
		expect(await differing(serveUrl, "stamp", stamps)).toEqual([]);
		expect(await differing(serveUrl, "stamp", stamps.slice(0, 30), "jpeg")).toEqual([]);
		expect(await differing(serveUrl, "palette", [0, 25, 49])).toEqual([]);
		expect(await differing(serveUrl, "effect-state", [0, 30, 60, 119])).toEqual([]);
		expect(await differing(serveUrl, "alpha", [0])).toEqual([]);
	});

	it("measures BeginFrame against screenshots at 1080p, one page", async () => {
		const serveUrl = bundles.get("protocol") as string;
		const composition = await selectComposition({
			serveUrl,
			id: "stamp",
			inputProps: { durationInFrames: 240 },
		});
		const results: string[] = [];
		const msPerFrame: Record<string, number> = {};
		for (const imageFormat of ["png", "jpeg"] as const) {
			for (const method of ["screenshot", "begin-frame"] as const) {
				const t = performance.now();
				await renderFrames({
					serveUrl,
					composition,
					outputDir: null,
					imageFormat,
					scale: 1920 / 512,
					concurrency: 1,
					captureMethod: method,
					onFrameBuffer: () => {},
				});
				const ms = (performance.now() - t) / composition.durationInFrames;
				msPerFrame[`${imageFormat}-${method}`] = ms;
				results.push(`${imageFormat} ${method}: ${ms.toFixed(1)} ms/frame`);
			}
			const speedUp =
				(msPerFrame[`${imageFormat}-screenshot`] as number) /
				(msPerFrame[`${imageFormat}-begin-frame`] as number);
			results.push(`${imageFormat} speed-up: ${speedUp.toFixed(2)}x`);
		}
		console.log(`BeginFrame against screenshot, 1920x1080, 240 frames:\n${results.join("\n")}`);
		// Since D-041 screenshots are as fast as BeginFrame on one page (D-043), and BeginFrame now
		// draws until the page is on screen before capturing: it must stay within 1.5 times the
		// screenshot path (measured 0.82 to 1.02 times in the pinned image).
		for (const format of ["png", "jpeg"]) {
			expect(msPerFrame[`${format}-begin-frame`]).toBeLessThan(
				1.5 * (msPerFrame[`${format}-screenshot`] as number),
			);
		}
	}, 600_000);
});
