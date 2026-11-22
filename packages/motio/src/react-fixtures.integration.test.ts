// React fixtures (ROADMAP M1): delayRender in an effect, setState in an effect,
// useDeferredValue, and lazy plus Suspense. Each composition draws its frame number as a frame
// stamp through its asynchronous path; every captured frame must show its own number, and the
// pixels must not depend on the order or the page the frame was rendered on.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createBundle } from "@motiojs/bundler";
import { renderFrames, renderStill, selectComposition } from "@motiojs/renderer";
import { decodeFrameStamp, decodeImage, hashFrame } from "@motiojs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const FIXTURE = resolve(import.meta.dirname, "../../../fixtures/compositions");
const STAMP = { x: 16, y: 8, blockSize: 16 };
const IDS = ["delay-in-effect", "state-in-effect", "deferred-value", "lazy-suspense"];

let outDir: string;
let serveUrl: string;

beforeAll(async () => {
	outDir = await mkdtemp(join(tmpdir(), "motio-react-fixtures-"));
	const bundle = await createBundle({
		entryPoint: "src/react-fixtures.tsx",
		rootDir: FIXTURE,
		outDir,
	});
	serveUrl = bundle.serveUrl;
});

afterAll(async () => {
	await rm(outDir, { recursive: true, force: true });
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

async function decode(buffer: Buffer, frame: number): Promise<string> {
	const img = await decodeImage(buffer);
	const stamp = decodeFrameStamp(img.data, img.width, img.height, STAMP);
	expect(stamp, `stamp of frame ${frame}`).toEqual({ ok: true, frame });
	return hashFrame(img.data);
}

async function renderAll(
	id: string,
	concurrency: number,
	frames: number[],
): Promise<Map<number, string>> {
	const composition = await selectComposition({ serveUrl, id, inputProps: {} });
	const buffers: Array<[number, Buffer]> = [];
	await renderFrames({
		serveUrl,
		composition,
		outputDir: null,
		imageFormat: "png",
		concurrency,
		frames,
		onFrameBuffer: (buffer, frame) => {
			buffers.push([frame, buffer]);
		},
	});
	const out = new Map<number, string>();
	for (const [frame, buffer] of buffers) out.set(frame, await decode(buffer, frame));
	return out;
}

describe.each(IDS)("%s", (id) => {
	it("shows the right frame in every capture, identically across pages and orders", async () => {
		const frames = Array.from({ length: 30 }, (_, i) => i * 3);
		const sequential = await renderAll(id, 1, frames);
		expect([...sequential.keys()].sort((a, b) => a - b)).toEqual(frames);
		const parallel = await renderAll(id, 4, frames);
		for (const f of frames)
			expect(parallel.get(f), `frame ${f} at concurrency 4`).toBe(sequential.get(f));

		const composition = await selectComposition({ serveUrl, id, inputProps: {} });
		for (const f of shuffle(frames, 7).slice(0, 6)) {
			const { buffer } = await renderStill({ serveUrl, composition, frame: f, imageFormat: "png" });
			if (!buffer) throw new Error("renderStill returned no buffer");
			expect(await decode(buffer, f), `frame ${f} on a fresh page`).toBe(sequential.get(f));
		}
	});
});
