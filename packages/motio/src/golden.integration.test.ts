// End-to-end proof of M1: fixtures/compositions, written against the Remotion API, bundled with
// @motiojs/bundler (remotion aliased to motio) and rendered with @motiojs/renderer, match the
// stills and metadata recorded from Remotion 4.0.545 (fixtures/compositions/__golden__/remotion).
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createBundle } from "@motiojs/bundler";
import { getCompositions, renderStill, selectComposition } from "@motiojs/renderer";
import { decodeImage, psnr, ssim } from "@motiojs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const FIXTURE = resolve(import.meta.dirname, "../../../fixtures/compositions");
const GOLDEN = join(FIXTURE, "__golden__/remotion");
const frames = JSON.parse(readFileSync(join(FIXTURE, "frames.json"), "utf8")) as Record<
	string,
	number[]
>;
const metadata = JSON.parse(readFileSync(join(GOLDEN, "metadata.json"), "utf8")) as {
	compositions: Record<string, Record<string, unknown>>;
};

// ROADMAP M1 thresholds.
const MEAN_SSIM = 0.99;
const MIN_PSNR_DB = 40;
const WORST_SSIM = 0.97;

let outDir: string;
let serveUrl: string;
const scores: Array<{ id: string; frame: number; ssim: number; psnr: number }> = [];

beforeAll(async () => {
	outDir = await mkdtemp(join(tmpdir(), "motio-golden-"));
	const bundle = await createBundle({ entryPoint: "src/index.ts", rootDir: FIXTURE, outDir });
	serveUrl = bundle.serveUrl;
});

afterAll(async () => {
	await rm(outDir, { recursive: true, force: true });
	if (scores.length > 0) {
		const lines = scores.map(
			(s) => `${s.id} ${s.frame}: SSIM ${s.ssim.toFixed(5)}, PSNR ${s.psnr.toFixed(2)} dB`,
		);
		console.log(`Golden comparison against Remotion 4.0.545:\n${lines.join("\n")}`);
	}
});

describe("compositions match Remotion's resolved metadata", () => {
	it("getCompositions() equals metadata.json", async () => {
		const list = await getCompositions({ serveUrl, inputProps: {} });
		const got = Object.fromEntries(
			list.map((c) => [
				c.id,
				{
					width: c.width,
					height: c.height,
					fps: c.fps,
					durationInFrames: c.durationInFrames,
					defaultProps: c.defaultProps,
					props: c.props,
				},
			]),
		);
		expect(got).toEqual(metadata.compositions);
	});
});

describe("stills match Remotion's reference renders", () => {
	for (const [id, list] of Object.entries(frames)) {
		it(`${id}: frames ${list.join(", ")}`, async () => {
			const composition = await selectComposition({ serveUrl, id, inputProps: {} });
			for (const frame of list) {
				const { buffer } = await renderStill({
					serveUrl,
					composition,
					frame,
					imageFormat: "png",
				});
				if (!buffer) throw new Error("renderStill returned no buffer");
				const ours = await decodeImage(buffer);
				const ref = await decodeImage(
					readFileSync(join(GOLDEN, id, `${String(frame).padStart(4, "0")}.png`)),
				);
				const s = ssim(ours, ref);
				const p = psnr(ours, ref);
				scores.push({ id, frame, ssim: s, psnr: p });
				expect(s, `${id} frame ${frame} SSIM`).toBeGreaterThanOrEqual(WORST_SSIM);
				expect(p, `${id} frame ${frame} PSNR`).toBeGreaterThanOrEqual(MIN_PSNR_DB);
			}
		});
	}

	it("meets the mean SSIM threshold over every still", () => {
		expect(scores.length).toBeGreaterThan(0);
		const mean = scores.reduce((sum, s) => sum + s.ssim, 0) / scores.length;
		expect(mean).toBeGreaterThanOrEqual(MEAN_SSIM);
	});
});
