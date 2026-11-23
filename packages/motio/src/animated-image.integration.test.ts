// End-to-end proof of <AnimatedImage>: fixtures/animated-image, written against the Remotion API
// (eight cells: GIF, APNG, WebP and AVIF, a playback rate, both loop behaviours that stop, and one
// placed with from, trimBefore and fit="contain"), bundled with @motiojs/bundler and rendered with
// @motiojs/renderer. Every output frame must show, in every cell, the image frame of Motio's
// timing rule (D-066), and the decoded frames must be identical at concurrency 1 in random order
// and at concurrency 4.
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createBundle } from "@motiojs/bundler";
import { renderFrames, selectComposition } from "@motiojs/renderer";
import { decodeImage, hashFrame } from "@motiojs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	CELLS,
	type Cell,
	cellCentre,
	DURATION,
	FPS,
} from "../../../fixtures/animated-image/src/cells.js";
import {
	animatedImageFrameAt,
	animatedImageTimeAt,
	animatedImageTimeline,
} from "../../core/src/media/animated-image-timing.js";

const FIXTURE = resolve(import.meta.dirname, "../../../fixtures/animated-image");
const description = JSON.parse(readFileSync(join(FIXTURE, "frames.json"), "utf8")) as {
	colors: number[][];
	durationsMs: number[];
};
const timeline = animatedImageTimeline(description.durationsMs.map((ms) => ms * 1000));

const require = createRequire(import.meta.url);
const packageDir = (name: string) => dirname(require.resolve(`${name}/package.json`));

let outDir: string;
let serveUrl: string;

beforeAll(async () => {
	outDir = await mkdtemp(join(tmpdir(), "motio-animated-image-"));
	// The fixture declares no dependencies, so remotion and React are aliased from here.
	const bundle = await createBundle({
		entryPoint: "src/index.ts",
		rootDir: FIXTURE,
		outDir,
		compat: { aliases: { remotion: resolve(import.meta.dirname, "../dist/remotion.js") } },
		viteOverride: (config) => ({
			...config,
			resolve: {
				...config.resolve,
				alias: [
					{ find: /^react$/, replacement: require.resolve("react") },
					{ find: /^react\/(.*)$/, replacement: `${packageDir("react")}/$1` },
					{ find: /^react-dom$/, replacement: require.resolve("react-dom") },
					{ find: /^react-dom\/(.*)$/, replacement: `${packageDir("react-dom")}/$1` },
				],
			},
		}),
	});
	serveUrl = bundle.serveUrl;
}, 120_000);

afterAll(async () => {
	if (outDir) await rm(outDir, { recursive: true, force: true });
});

/** Deterministic Fisher-Yates shuffle. */
function shuffle<T>(items: readonly T[], seed: number): T[] {
	const a = [...items];
	let s = seed;
	for (let i = a.length - 1; i > 0; i--) {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		const j = s % (i + 1);
		[a[i], a[j]] = [a[j] as T, a[i] as T];
	}
	return a;
}

/** The image frame a cell shows at a composition frame; "black" where nothing is drawn. */
function expected(cell: Cell, frame: number): number | "black" {
	const from = cell.from ?? 0;
	if (frame < from) return "black";
	const local = (frame - from) * (cell.playbackRate ?? 1) + (cell.trimBefore ?? 0);
	const index = animatedImageFrameAt(
		timeline,
		animatedImageTimeAt(local, FPS),
		cell.loopBehavior ?? "loop",
	);
	return index ?? "black";
}

/** The fixture colour at a pixel (AVIF is lossy: within 12 levels in all), or "black". */
function colourAt(data: Uint8Array | Uint8ClampedArray, width: number, x: number, y: number) {
	const at = (y * width + x) * 4;
	const [r = 0, g = 0, b = 0] = [data[at], data[at + 1], data[at + 2]];
	if (r + g + b <= 6) return "black";
	let best = -1;
	let distance = Number.POSITIVE_INFINITY;
	description.colors.forEach(([cr = 0, cg = 0, cb = 0], i) => {
		const d = Math.abs(r - cr) + Math.abs(g - cg) + Math.abs(b - cb);
		if (d < distance) {
			distance = d;
			best = i;
		}
	});
	return distance <= 12 ? best : `rgb(${r}, ${g}, ${b})`;
}

async function renderAll(
	concurrency: number,
	order: (frames: number[]) => number[],
): Promise<{ hashes: Map<number, string>; wrong: string[] }> {
	const composition = await selectComposition({ serveUrl, id: "AnimatedImages", inputProps: {} });
	const buffers: Array<[number, Buffer]> = [];
	await renderFrames({
		serveUrl,
		composition,
		outputDir: null,
		imageFormat: "png",
		concurrency,
		frameOrder: order,
		onFrameBuffer: (buffer, frame) => {
			buffers.push([frame, buffer]);
		},
	});
	const hashes = new Map<number, string>();
	const wrong: string[] = [];
	for (const [frame, buffer] of buffers) {
		const image = await decodeImage(buffer);
		hashes.set(frame, hashFrame(image.data));
		CELLS.forEach((cell, i) => {
			const { x, y } = cellCentre(i);
			const got = colourAt(image.data, image.width, x, y);
			const want = expected(cell, frame);
			if (got !== want) wrong.push(`frame ${frame} cell ${i} (${cell.file}): ${got}, want ${want}`);
		});
	}
	return { hashes, wrong };
}

describe("AnimatedImage in a render", () => {
	it("shows the right image frame in every cell of every frame, identically across orders and pages", async () => {
		const all = Array.from({ length: DURATION }, (_, i) => i);
		const random = await renderAll(1, (frames) => shuffle(frames, 11));
		expect(random.wrong).toEqual([]);
		expect([...random.hashes.keys()].sort((a, b) => a - b)).toEqual(all);
		const parallel = await renderAll(4, (frames) => frames);
		expect(parallel.wrong).toEqual([]);
		for (const f of all) {
			expect(parallel.hashes.get(f), `frame ${f} at concurrency 4`).toBe(random.hashes.get(f));
		}
		// Every image frame appears in the plain GIF cell over the 90 frames (3 s, 3.75 plays).
		expect(new Set(all.map((f) => expected(CELLS[0] as Cell, f))).size).toBe(8);
	}, 300_000);
});
