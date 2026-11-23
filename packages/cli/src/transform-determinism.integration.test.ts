// ARCHITECTURE, "Raster reset": an element whose CSS transform changes from frame to frame must
// give the same pixels whatever the page rendered before. Blink skips the raster invalidation of transform changes
// below a tolerance (0.01 px of translation, 1e-4 in the other components) and keeps the raster
// scale of `will-change: transform` layers, so without the renderer's reset a frame could show
// content rasterised for an earlier frame (up to 99 levels apart on these compositions).
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBundle } from "@motiojs/bundler";
import { renderFrames, selectComposition } from "@motiojs/renderer";
import { decodeImage, hashFrame } from "@motiojs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultDeps, runCli } from "./main.js";
import { testIo } from "./test-support/fakes.js";

const project = fileURLToPath(new URL("../test-fixtures/transforms/", import.meta.url));
let out: string;
let serveUrl: string;

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
	/** Every frame on a fresh page: the reference without any history. */
	fresh?: boolean;
}

const RUNS: Run[] = [
	{ name: "fresh page per frame", concurrency: 1, fresh: true },
	{ name: "ascending, concurrency 1", concurrency: 1 },
	{ name: "descending, concurrency 1", concurrency: 1, order: (f) => [...f].reverse() },
	{ name: "shuffled, concurrency 1", concurrency: 1, order: (f) => shuffle(f, 7) },
	{ name: "shuffled, concurrency 4", concurrency: 4, order: (f) => shuffle(f, 11) },
];

/** Decoded RGBA hashes of every frame of `id`, one map per run. */
async function hashes(id: string, imageFormat: "png" | "jpeg", runs: Run[]) {
	const composition = await selectComposition({ serveUrl, id, inputProps: {} });
	const result: Array<Map<number, string>> = [];
	for (const run of runs) {
		const images = new Map<number, Buffer>();
		await renderFrames({
			serveUrl,
			composition,
			outputDir: null,
			imageFormat,
			concurrency: run.concurrency,
			...(run.order ? { frameOrder: run.order } : {}),
			...(run.fresh ? { recycleEveryNFrames: 1 } : {}),
			onFrameBuffer: (buffer, frame) => void images.set(frame, buffer),
		});
		const map = new Map<number, string>();
		for (const [frame, image] of images) map.set(frame, hashFrame((await decodeImage(image)).data));
		result.push(map);
	}
	return result;
}

/** Frames of each run whose pixels differ from the fresh-page reference, by run name. */
function mismatches(runs: Run[], maps: Array<Map<number, string>>): Record<string, number[]> {
	const [reference] = maps as [Map<number, string>];
	const out: Record<string, number[]> = {};
	for (const [i, map] of maps.entries()) {
		out[runs[i]?.name as string] = [...reference.keys()]
			.sort((a, b) => a - b)
			.filter((f) => map.get(f) !== reference.get(f));
	}
	return out;
}

const none = (runs: Run[]) => Object.fromEntries(runs.map((r) => [r.name, []]));

describe("transforms animated over frames give the same pixels in any order", () => {
	for (const id of [
		"scale-from-zero",
		"scale-near-one",
		"rotate-translate",
		"tiny-steps",
		"will-change",
	]) {
		it(`${id}: PNG, every order and concurrency`, async () => {
			const maps = await hashes(id, "png", RUNS);
			expect(maps[0]?.size).toBe(60);
			expect(mismatches(RUNS, maps)).toEqual(none(RUNS));
		}, 180_000);
	}

	const jpegRuns = RUNS.filter((_, i) => i === 0 || i === 2 || i === 4);
	for (const id of ["scale-from-zero", "tiny-steps"]) {
		it(`${id}: JPEG (software compositing)`, async () => {
			expect(mismatches(jpegRuns, await hashes(id, "jpeg", jpegRuns))).toEqual(none(jpegRuns));
		}, 180_000);
	}

	it("motio check determinism passes on a spring-scaled logo", async () => {
		const io = testIo(project);
		const code = await runCli(
			["check", "determinism", "scale-from-zero", "--frames=0-59", "--json"],
			io,
			defaultDeps(process.env),
		);
		const result = JSON.parse(io.out.join("")) as Record<string, unknown>;
		expect(result).toMatchObject({ deterministic: true, mismatches: [] });
		expect(code).toBe(0);
	}, 180_000);
});
