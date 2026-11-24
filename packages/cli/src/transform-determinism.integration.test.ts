// M1 determinism criterion (ROADMAP): every frame of every run must give the decoded pixels of a
// reference rendered with a new page per frame, whatever the order, the concurrency, the image
// format and the capture path. Comparing runs with each other is not enough: two runs whose pages
// carry the same history agree even when both are wrong (D-072). The compositions move below
// Blink's raster tolerance (0.01 px of translation, 1e-4 in the other transform components), where
// a frame can show content rasterised for the frame the same page rendered before (ARCHITECTURE,
// "Raster reset"); without the reset these runs differ from the reference by up to 222 levels.
// A transparent capture of two opaque scenes sharing a fractional edge also needs its tiles
// cleared, or the antialiased seam blends with whatever the reused tile memory held.

import { mkdtemp, rm } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBundle } from "@motiojs/bundler";
import {
	type CaptureMethod,
	ensureBrowser,
	probeBeginFrame,
	renderFrames,
	selectComposition,
} from "@motiojs/renderer";
import { decodeImage, hashFrame } from "@motiojs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultDeps, runCli } from "./main.js";
import { testIo } from "./test-support/fakes.js";

const project = fileURLToPath(new URL("../test-fixtures/transforms/", import.meta.url));
let out: string;
let serveUrl: string;

// BeginFrame capture exists on Linux only (D-033); there a failed probe fails the run instead of
// skipping, as in the BeginFrame identity tests.
const linux = process.platform === "linux";
const beginFrame = linux
	? await probeBeginFrame(
			process.env.MOTIO_BROWSER_EXECUTABLE ?? (await ensureBrowser()).executablePath,
		)
	: { supported: false, reason: "BeginFrame capture is available on Linux only" };
const METHODS: CaptureMethod[] = linux ? ["screenshot", "begin-frame"] : ["screenshot"];

beforeAll(async () => {
	out = await mkdtemp(join(tmpdir(), "motio-transforms-"));
	serveUrl = (
		await createBundle({
			entryPoint: "src/index.ts",
			rootDir: project,
			outDir: join(out, "bundle"),
		})
	).serveUrl;
}, 120_000);
afterAll(() => rm(out, { recursive: true, force: true }));

/** Deterministic Fisher-Yates shuffle. */
function shuffle(items: readonly number[], seed: number): number[] {
	const a = [...items];
	let s = seed;
	for (let i = a.length - 1; i > 0; i--) {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		const j = s % (i + 1);
		[a[i], a[j]] = [a[j] as number, a[i] as number];
	}
	return a;
}

interface Run {
	name: string;
	concurrency: number;
	order?: (frames: number[]) => number[];
}

// The renderer refuses a concurrency above the CPU threads.
const high = (n: number) => Math.min(n, availableParallelism());
const RUNS: Run[] = [
	{ name: "ascending, concurrency 1", concurrency: 1 },
	{ name: "descending, concurrency 1", concurrency: 1, order: (f) => [...f].reverse() },
	{ name: "random, concurrency 1", concurrency: 1, order: (f) => shuffle(f, 7) },
	{ name: "ascending, concurrency 4", concurrency: high(4) },
	{ name: "random, concurrency 4", concurrency: high(4), order: (f) => shuffle(f, 11) },
	{ name: "ascending, concurrency 8", concurrency: high(8) },
	{ name: "random, concurrency 8", concurrency: high(8), order: (f) => shuffle(f, 13) },
];

/** Decoded RGBA hash of every frame of one render. */
async function render(
	id: string,
	imageFormat: "png" | "jpeg",
	options: { captureMethod: CaptureMethod; concurrency: number; fresh?: boolean; run?: Run },
): Promise<Map<number, string>> {
	const composition = await selectComposition({ serveUrl, id, inputProps: {} });
	const images = new Map<number, Buffer>();
	await renderFrames({
		serveUrl,
		composition,
		outputDir: null,
		imageFormat,
		captureMethod: options.captureMethod,
		concurrency: options.concurrency,
		...(options.run?.order ? { frameOrder: options.run.order } : {}),
		// Every frame on a new page: the reference, without any history.
		...(options.fresh ? { recycleEveryNFrames: 1 } : {}),
		onFrameBuffer: (buffer, frame) => void images.set(frame, buffer),
	});
	const hashes = new Map<number, string>();
	for (const [frame, image] of images) {
		hashes.set(frame, hashFrame((await decodeImage(image)).data));
	}
	return hashes;
}

/** Frames of each run whose pixels differ from a new page per frame, by run name. */
async function mismatches(
	id: string,
	imageFormat: "png" | "jpeg",
	captureMethod: CaptureMethod,
): Promise<Record<string, number[]>> {
	// The reference is captured with screenshots: BeginFrame gives identical pixels (D-033), so a
	// BeginFrame run is held to the same reference.
	const reference = await render(id, imageFormat, {
		captureMethod: "screenshot",
		concurrency: 1,
		fresh: true,
	});
	expect(reference.size).toBe(60);
	const result: Record<string, number[]> = {};
	for (const run of runsFor(captureMethod)) {
		const hashes = await render(id, imageFormat, {
			captureMethod,
			concurrency: run.concurrency,
			run,
		});
		result[run.name] = [...reference.keys()]
			.sort((a, b) => a - b)
			.filter((f) => hashes.get(f) !== reference.get(f));
	}
	return result;
}

/** BeginFrame capture renders one page at a time; higher concurrencies are refused. */
const runsFor = (method: CaptureMethod) =>
	method === "begin-frame" ? RUNS.filter((r) => r.concurrency === 1) : RUNS;
const none = (method: CaptureMethod) =>
	Object.fromEntries(runsFor(method).map((r) => [r.name, []]));

const COMPOSITIONS = [
	"scale-from-zero",
	"scale-near-one",
	"rotate-translate",
	"tiny-steps",
	"subpixel-translate",
	"will-change",
	// Two opaque scenes meeting at a fractional edge (slide()): Chrome rasterises the layer without
	// clearing its tiles, and the seam column blends over stale tile memory. Only transparent
	// captures show it: JPEG draws the opaque background below the seam.
	"slide-seam",
];
// JPEG composites in software and PNG with alpha on the CPU (D-041): both paths are checked on the
// compositions below the tolerance.
const JPEG_COMPOSITIONS = ["scale-from-zero", "tiny-steps", "subpixel-translate", "will-change"];

describe("animated transforms give the pixels of a new page per frame in any order", () => {
	it.runIf(linux)("can capture with BeginFrame on Linux, one page at a time", async () => {
		expect(beginFrame).toMatchObject({ supported: true });
		const composition = await selectComposition({ serveUrl, id: "tiny-steps", inputProps: {} });
		await expect(
			renderFrames({
				serveUrl,
				composition,
				outputDir: null,
				imageFormat: "png",
				captureMethod: "begin-frame",
				concurrency: 2,
				onFrameBuffer: () => {},
			}),
		).rejects.toMatchObject({ code: "E_BEGIN_FRAME_UNSUPPORTED" });
	});

	for (const method of METHODS) {
		for (const id of COMPOSITIONS) {
			it(`${id}: PNG, ${method}`, async () => {
				expect(await mismatches(id, "png", method)).toEqual(none(method));
			}, 600_000);
		}
		for (const id of JPEG_COMPOSITIONS) {
			it(`${id}: JPEG, ${method}`, async () => {
				expect(await mismatches(id, "jpeg", method)).toEqual(none(method));
			}, 600_000);
		}
	}

	it("motio check determinism --reference fresh passes on a spring-scaled logo", async () => {
		const io = testIo(project);
		const code = await runCli(
			["check", "determinism", "scale-from-zero", "--frames=0-59", "--reference=fresh", "--json"],
			io,
			defaultDeps(process.env),
		);
		const result = JSON.parse(io.out.join("")) as Record<string, unknown>;
		expect(result).toMatchObject({ reference: "fresh", deterministic: true, mismatches: [] });
		expect(code).toBe(0);
	}, 300_000);
});
