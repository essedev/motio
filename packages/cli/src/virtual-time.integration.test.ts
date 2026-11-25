// The virtual time model (ARCHITECTURE, "Time"): code that reads the clock instead of the frame (a
// GSAP-style timeline on requestAnimationFrame, a canvas loop integrating the time between
// animation frames, a setInterval counter, Date-based motion, Math.random) gives the decoded
// pixels of one ascending render on one page, whatever the order, the concurrency and where a
// render starts. Pages step through every frame from frame 0 and a page never goes back, so the
// state timers accumulate is the same on every page. The composition declares `timeModel="virtual"`,
// so these renders also check that the composition's default applies without the option.

import { mkdtemp, rm } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBundle } from "@motiojs/bundler";
import { type RenderFramesOptions, renderFrames, selectComposition } from "@motiojs/renderer";
import { decodeImage, hashFrame } from "@motiojs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultDeps, runCli } from "./main.js";
import { testIo } from "./test-support/fakes.js";

const project = fileURLToPath(new URL("../test-fixtures/virtual-time/", import.meta.url));
const ID = "clock-driven";
let out: string;
let serveUrl: string;

beforeAll(async () => {
	out = await mkdtemp(join(tmpdir(), "motio-virtual-time-"));
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

/** Decoded RGBA hash of every frame one render produced. */
async function render(
	options: Partial<
		Pick<
			RenderFramesOptions,
			"concurrency" | "frameOrder" | "frameRange" | "recycleEveryNFrames" | "timeModel"
		>
	>,
): Promise<Map<number, string>> {
	const composition = await selectComposition({ serveUrl, id: ID });
	const images = new Map<number, Buffer>();
	await renderFrames({
		serveUrl,
		composition,
		outputDir: null,
		imageFormat: "png",
		onFrameBuffer: (buffer, frame) => void images.set(frame, buffer),
		...options,
	});
	const hashes = new Map<number, string>();
	for (const [frame, image] of images)
		hashes.set(frame, hashFrame((await decodeImage(image)).data));
	return hashes;
}

const high = (n: number) => Math.min(n, availableParallelism());

describe("virtual time model", () => {
	it("takes the composition's time model", async () => {
		const composition = await selectComposition({ serveUrl, id: ID });
		expect(composition.timeModel).toBe("virtual");
	});

	it("gives the frames of one ascending render in every order, concurrency and range", async () => {
		const reference = await render({ concurrency: 1 });
		expect(reference.size).toBe(60);
		// Every frame differs from the others: the panels move on every frame.
		expect(new Set(reference.values()).size).toBe(60);
		const runs: Record<string, Parameters<typeof render>[0]> = {
			"a new page per frame": { concurrency: 1, recycleEveryNFrames: 1 },
			"descending, concurrency 1": { concurrency: 1, frameOrder: (f) => [...f].reverse() },
			"random, concurrency 1": { concurrency: 1, frameOrder: (f) => shuffle(f, 7) },
			"ascending, concurrency 4": { concurrency: high(4) },
			"random, concurrency 4": { concurrency: high(4), frameOrder: (f) => shuffle(f, 11) },
			"ascending, concurrency 8": { concurrency: high(8) },
			"random, concurrency 8": { concurrency: high(8), frameOrder: (f) => shuffle(f, 13) },
			"frames 0 to 19": { concurrency: 1, frameRange: [0, 19] },
			"frames 20 to 39": { concurrency: 1, frameRange: [20, 39] },
			"frames 40 to 59": { concurrency: 1, frameRange: [40, 59] },
			"frames 25 to 59, concurrency 2": { concurrency: high(2), frameRange: [25, 59] },
			"frames 33 to 59, recycled every 7 frames": {
				concurrency: high(2),
				frameRange: [33, 59],
				recycleEveryNFrames: 7,
			},
		};
		const differing: Record<string, number[]> = {};
		for (const [name, options] of Object.entries(runs)) {
			const hashes = await render(options);
			differing[name] = [...hashes].flatMap(([f, h]) => (h === reference.get(f) ? [] : [f]));
		}
		expect(differing).toEqual(Object.fromEntries(Object.keys(runs).map((name) => [name, []])));
	}, 600_000);

	it("motio check determinism --reference fresh passes", async () => {
		const io = testIo(project);
		const code = await runCli(
			["check", "determinism", ID, "--frames=0-29", "--reference=fresh", "--json"],
			io,
			defaultDeps(process.env),
		);
		const result = JSON.parse(io.out.join("")) as Record<string, unknown>;
		expect(result).toMatchObject({ reference: "fresh", deterministic: true, mismatches: [] });
		expect(code).toBe(0);
	}, 300_000);
});
