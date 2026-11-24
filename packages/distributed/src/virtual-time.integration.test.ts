// The virtual time model across chunks (ARCHITECTURE, "Time"): each chunk worker opens its own
// pages, which step through every frame from frame 0 before the chunk's first, so a chunked
// render of code that reads the clock gives the frames of the single-node render. ProRes is
// intra-only, so decoded frames do not depend on where chunks start.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createBundle } from "@motiojs/bundler";
import { renderMedia, selectComposition } from "@motiojs/renderer";
import { hashFrame, probeVideo } from "@motiojs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decodeRgba } from "../../renderer/src/test-support/video-checks.js";
import { renderDistributed } from "./index.js";

let dir: string;
let serveUrl: string;

beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), "motio-distributed-virtual-"));
	serveUrl = (
		await createBundle({
			entryPoint: "src/index.ts",
			rootDir: resolve(import.meta.dirname, "../../cli/test-fixtures/virtual-time"),
			outDir: join(dir, "bundle"),
		})
	).serveUrl;
}, 180_000);
afterAll(() => rm(dir, { recursive: true, force: true }));

async function hashes(file: string): Promise<string[]> {
	const { width, height } = await probeVideo(file);
	return (await decodeRgba(file, width, height)).map((f) => hashFrame(f));
}

describe("virtual time model in chunks", () => {
	it("gives the single-node frames across 4 chunks", async () => {
		const selected = await selectComposition({ serveUrl, id: "clock-driven" });
		expect(selected.timeModel).toBe("virtual");
		// Without the composition's default, so the option has to reach every chunk worker.
		const { timeModel: _, ...composition } = selected;
		const single = join(dir, "single.mov");
		const chunked = join(dir, "chunked.mov");
		const options = {
			codec: "prores",
			imageFormat: "png",
			muted: true,
			timeModel: "virtual",
			// Software 2D canvas: on the GPU process the fixture's canvas can differ under heavy load,
			// whatever the time model (see packages/cli/src/virtual-time.integration.test.ts).
			chromiumOptions: { flags: { "disable-accelerated-2d-canvas": true } },
		} as const;
		await renderMedia({
			serveUrl,
			composition,
			concurrency: 1,
			outputLocation: single,
			...options,
		});
		const result = await renderDistributed({
			serveUrl,
			composition,
			outputLocation: chunked,
			concurrency: 4,
			chunks: 4,
			...options,
		});
		expect(result.chunks).toHaveLength(4);
		const a = await hashes(single);
		expect(a).toHaveLength(60);
		expect(new Set(a).size).toBe(60);
		expect(await hashes(chunked)).toEqual(a);
	}, 300_000);
});
